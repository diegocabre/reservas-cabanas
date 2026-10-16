// Reseñas: derechos del huésped (link de acceso por correo, réplica y solicitudes).

import { db } from "@/lib/db";
import { cupoCorreo } from "@/lib/limites";
import type { Resultado } from "@/lib/estados-reserva";
import { enviarLinkAccesoHuesped } from "@/lib/notificaciones";
import { aFechaIso } from "@/lib/precios";
import {
  HORAS_LINK_ACCESO,
  LARGO_COMENTARIO,
  MINUTOS_ENTRE_LINKS,
  firmarToken,
  formaDeToken,
  hashToken,
  limpiarTexto,
  normalizarEmail,
  secretoResenas,
} from "@/lib/resenas-reglas";
import { urlDelSitio } from "@/lib/sitio";
import { registrar, detalleError } from "@/lib/registro";
import { emailValido } from "@/lib/resenas/comun";

// ---------------------------------------------------------------------------------------------
// Derechos del huésped (Ley 21.719): link de acceso por correo, réplica y solicitudes
// ---------------------------------------------------------------------------------------------

/**
 * Envía al correo del huésped un link de acceso (24 h). Siempre "funciona" para quien llama: no
 * revela si el email existe. Máximo un link cada 10 minutos por huésped.
 */
export async function pedirAccesoHuesped(emailCrudo: string, ahora = new Date()): Promise<void> {
  const email = normalizarEmail(emailCrudo);
  if (!emailValido(email)) return;
  const h = await db.huesped.findUnique({ where: { email }, select: { id: true, email: true, accesoVersion: true } });
  if (!h) return;
  const version = h.accesoVersion + 1;
  const token = firmarToken(secretoResenas(), "acceso", h.id, version);
  const { count } = await db.huesped.updateMany({
    where: {
      id: h.id,
      accesoVersion: h.accesoVersion,
      OR: [{ accesoPedidoEn: null }, { accesoPedidoEn: { lt: new Date(ahora.getTime() - MINUTOS_ENTRE_LINKS * 60_000) } }],
    },
    data: { accesoVersion: version, accesoHash: hashToken(token), accesoExpiraEn: new Date(ahora.getTime() + HORAS_LINK_ACCESO * 3_600_000), accesoPedidoEn: ahora },
  });
  if (count === 0) return;
  // Tope diario de correos por dirección (lib/limites.ts), además del mínimo de 10 minutos entre links.
  if (!(await cupoCorreo(h.email, ahora))) return;
  const resultado = await enviarLinkAccesoHuesped(h.email, new URL(`/mis-datos/${token}`, urlDelSitio()).toString());
  if (!resultado.ok) registrar("error", "correo_fallido", { correo: "acceso_huesped", huespedId: h.id, detalle: detalleError(resultado.error) });
}

/** Huésped del link de acceso vigente, o null. */
async function huespedPorAcceso(token: string, ahora: Date) {
  if (!formaDeToken(token)) return null;
  const h = await db.huesped.findUnique({
    where: { accesoHash: hashToken(token) },
    select: { id: true, email: true, telefono: true, nombrePila: true, accesoExpiraEn: true },
  });
  return h && h.accesoExpiraEn && h.accesoExpiraEn > ahora ? h : null;
}

/** Lo que ve el huésped en /mis-datos/[token]: sus datos y las reseñas PUBLICADAS sobre él. */
export async function abrirAccesoHuesped(token: string, ahora = new Date()) {
  const h = await huespedPorAcceso(token, ahora);
  if (!h) return null;
  const [reservas, resenas, solicitudes] = await Promise.all([
    db.reserva.count({ where: { huespedId: h.id } }),
    db.resenaHuesped.findMany({
      where: { huespedId: h.id, estado: "publicada" },
      select: {
        id: true,
        calificacion: true,
        etiquetas: true,
        comentario: true,
        publicadaEn: true,
        propiedad: { select: { nombre: true } },
        reserva: { select: { checkIn: true, checkOut: true, cabana: { select: { nombre: true } } } },
        replica: { select: { texto: true } },
      },
      orderBy: { publicadaEn: "desc" },
    }),
    db.solicitudPrivacidad.findMany({ where: { huespedId: h.id }, select: { id: true, tipo: true, estado: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    huesped: { email: h.email, telefono: h.telefono, nombrePila: h.nombrePila },
    reservas,
    resenas: resenas.map((r) => ({ ...r, reserva: { ...r.reserva, checkIn: aFechaIso(r.reserva.checkIn), checkOut: aFechaIso(r.reserva.checkOut) } })),
    solicitudes,
  };
}

/** Réplica del huésped a una reseña publicada sobre él (una por reseña; se puede reescribir). */
export async function replicarResena(token: string, resenaId: string, texto: unknown, ahora = new Date()): Promise<Resultado> {
  const h = await huespedPorAcceso(token, ahora);
  if (!h) return { ok: false, error: "El link venció. Pide uno nuevo." };
  const limpio = limpiarTexto(texto, LARGO_COMENTARIO);
  if (!limpio) return { ok: false, error: "Escribe tu réplica." };
  const r = await db.resenaHuesped.findFirst({ where: { id: resenaId, huespedId: h.id, estado: "publicada" }, select: { id: true } });
  if (!r) return { ok: false, error: "No encontramos esa reseña." };
  await db.replicaHuesped.upsert({ where: { resenaId }, create: { resenaId, texto: limpio }, update: { texto: limpio } });
  return { ok: true };
}

/** Solicitud de rectificación o eliminación: llega a la cola de moderación (nada se borra solo). */
export async function solicitarPrivacidad(token: string, tipo: unknown, mensaje: unknown, ahora = new Date()): Promise<Resultado> {
  const h = await huespedPorAcceso(token, ahora);
  if (!h) return { ok: false, error: "El link venció. Pide uno nuevo." };
  if (tipo !== "rectificacion" && tipo !== "eliminacion") return { ok: false, error: "Elige qué quieres solicitar." };
  const limpio = limpiarTexto(mensaje, 2000);
  if (!limpio) return { ok: false, error: "Cuéntanos qué quieres corregir o eliminar." };
  const pendientes = await db.solicitudPrivacidad.count({ where: { huespedId: h.id, estado: "pendiente" } });
  if (pendientes >= 3) return { ok: false, error: "Ya tienes solicitudes en revisión. Te responderemos pronto." };
  await db.solicitudPrivacidad.create({ data: { huespedId: h.id, tipo, mensaje: limpio } });
  return { ok: true };
}
