// Reseñas: la reseña de la cabaña que deja el huésped con el link (token) de su invitación.

import { db } from "@/lib/db";
import type { Resultado } from "@/lib/estados-reserva";
import { formatearFechaLarga, hoyEnChile } from "@/lib/formato";
import { ErrorAccion } from "@/lib/panel-acciones";
import { aFechaIso } from "@/lib/precios";
import {
  CATEGORIAS,
  DIAS_PLAZO_RESENA,
  LARGO_COMENTARIO,
  LARGO_MINIMO_COMENTARIO,
  MAXIMO_EDICIONES,
  firmarToken,
  formaDeToken,
  hashToken,
  limpiarTexto,
  nombrePublico,
  secretoResenas,
  type Notas,
} from "@/lib/resenas-reglas";
import { elegible, evaluarDesbloqueo } from "@/lib/resenas/comun";

// ---------------------------------------------------------------------------------------------
// Huésped: reseña de la cabaña con el link de la invitación
// ---------------------------------------------------------------------------------------------

const SELECT_CICLO_TOKEN = {
  id: true,
  reservaId: true,
  tokenExpiraEn: true,
  desbloqueadoEn: true,
  reserva: {
    select: {
      estado: true,
      checkIn: true,
      checkOut: true,
      huespedNombre: true,
      cabanaId: true,
      cabana: { select: { nombre: true, slug: true, demo: true, propiedad: { select: { nombre: true, slug: true, resenas: true, suspendida: true } } } },
      resenaCabana: {
        select: { estado: true, comentario: true, ediciones: true, limpieza: true, ubicacion: true, comunicacion: true, veracidad: true, calidadPrecio: true },
      },
    },
  },
} as const;

export type Invitacion =
  | { estado: "invalido" }
  | { estado: "vencido"; cabana: string; motivo: string }
  | { estado: "no_elegible"; cabana: string; motivo: string }
  | { estado: "publicada"; cabana: string; urlCabana: string }
  | {
      estado: "formulario";
      cabana: string;
      propiedad: string;
      nombre: string;
      llegada: string;
      salida: string;
      desbloqueado: boolean; // se publica apenas la envíe
      previa: (Notas & { comentario: string; edicionesRestantes: number }) | null; // reseña retenida para editar
    };

/** Lo que muestra /resena/[token]. Solo lee: el token se consume al enviar. */
export async function abrirInvitacion(token: string, ahora = new Date()): Promise<Invitacion> {
  if (!formaDeToken(token)) return { estado: "invalido" };
  const c = await db.cicloResena.findUnique({ where: { tokenHash: hashToken(token) }, select: SELECT_CICLO_TOKEN });
  if (!c) return { estado: "invalido" };
  const r = c.reserva;
  const cabana = r.cabana.nombre;
  if (c.tokenExpiraEn <= ahora) return { estado: "vencido", cabana, motivo: `El plazo para dejar la reseña terminó (${DIAS_PLAZO_RESENA} días desde tu salida).` };
  const el = elegible(r, hoyEnChile(ahora));
  if (!el.ok) return { estado: "no_elegible", cabana, motivo: el.motivo };
  const previa = r.resenaCabana;
  if (previa && previa.estado !== "retenida") return { estado: "publicada", cabana, urlCabana: `/${r.cabana.propiedad.slug}/${r.cabana.slug}` };
  return {
    estado: "formulario",
    cabana,
    propiedad: r.cabana.propiedad.nombre,
    nombre: nombrePublico(r.huespedNombre),
    llegada: formatearFechaLarga(aFechaIso(r.checkIn)),
    salida: formatearFechaLarga(aFechaIso(r.checkOut)),
    desbloqueado: c.desbloqueadoEn !== null,
    previa: previa
      ? {
          limpieza: previa.limpieza,
          ubicacion: previa.ubicacion,
          comunicacion: previa.comunicacion,
          veracidad: previa.veracidad,
          calidadPrecio: previa.calidadPrecio,
          comentario: previa.comentario,
          edicionesRestantes: MAXIMO_EDICIONES - previa.ediciones,
        }
      : null,
  };
}

/** Valida las notas (enteros 1 a 5) y el comentario. Devuelve el error para el huésped o los datos limpios. */
export function validarResenaCabana(datos: { notas: Record<string, unknown>; comentario: unknown }): Resultado<{ notas: Notas; comentario: string }> {
  const notas = {} as Notas;
  for (const c of CATEGORIAS) {
    const v = Number(datos.notas[c.clave]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return { ok: false, error: `Califica «${c.nombre}» de 1 a 5 estrellas.` };
    notas[c.clave] = v;
  }
  const comentario = limpiarTexto(datos.comentario, LARGO_COMENTARIO);
  if (comentario.length < LARGO_MINIMO_COMENTARIO) return { ok: false, error: `Cuéntanos un poco más (mínimo ${LARGO_MINIMO_COMENTARIO} caracteres).` };
  return { ok: true, notas, comentario };
}

/**
 * Guarda (o edita, mientras está retenida) la reseña de la cabaña. Consume el token: devuelve uno
 * nuevo para volver a editarla. Si el doble ciego ya se desbloqueó, se publica al tiro y no se edita más.
 */
export async function enviarResenaCabana(
  token: string,
  datos: { notas: Record<string, unknown>; comentario: unknown },
  ahora = new Date(),
): Promise<Resultado<{ token: string; publicada: boolean }>> {
  const valida = validarResenaCabana(datos);
  if (!valida.ok) return valida;
  if (!formaDeToken(token)) return { ok: false, error: "Este link no es válido o ya se usó." };

  let reservaId = "";
  try {
    const r = await db.$transaction(async (tx) => {
      // Bloquea el ciclo: dos envíos con el mismo link no pasan los dos (el segundo ya no encuentra el hash).
      const filas = await tx.$queryRaw<{ id: string }[]>`select id from ciclo_resena where token_hash = ${hashToken(token)} for update`;
      if (filas.length === 0) throw new ErrorAccion("Este link no es válido o ya se usó.");
      const c = await tx.cicloResena.findUniqueOrThrow({ where: { id: filas[0].id }, select: { ...SELECT_CICLO_TOKEN, tokenVersion: true } });
      reservaId = c.reservaId;
      if (c.tokenExpiraEn <= ahora) throw new ErrorAccion("El plazo para dejar la reseña terminó.");
      const el = elegible(c.reserva, hoyEnChile(ahora));
      if (!el.ok) throw new ErrorAccion(el.motivo);

      const previa = c.reserva.resenaCabana;
      const publicar = c.desbloqueadoEn !== null;
      if (previa) {
        if (previa.estado !== "retenida") throw new ErrorAccion("Tu reseña ya se publicó y no se puede editar.");
        if (previa.ediciones >= MAXIMO_EDICIONES) throw new ErrorAccion("Ya editaste tu reseña varias veces. Si necesitas cambiarla, escríbenos.");
        await tx.resenaCabana.update({ where: { reservaId: c.reservaId }, data: { ...valida.notas, comentario: valida.comentario, ediciones: { increment: 1 } } });
      } else {
        await tx.resenaCabana.create({
          data: {
            reservaId: c.reservaId,
            cabanaId: c.reserva.cabanaId,
            nombrePublico: nombrePublico(c.reserva.huespedNombre),
            ...valida.notas,
            comentario: valida.comentario,
            estado: publicar ? "publicada" : "retenida",
            publicadaEn: publicar ? ahora : null,
          },
        });
      }
      // Token de un solo uso: sube la versión. El link nuevo solo sirve para editar mientras esté retenida.
      const version = c.tokenVersion + 1;
      const nuevo = firmarToken(secretoResenas(), "resena", c.id, version);
      await tx.cicloResena.update({ where: { id: c.id }, data: { tokenVersion: version, tokenHash: hashToken(nuevo) } });
      return { token: nuevo, publicada: publicar };
    });
    await evaluarDesbloqueo(reservaId, ahora);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ErrorAccion) return { ok: false, error: e.message };
    throw e;
  }
}
