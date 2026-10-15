// Reseñas con base de datos (reglas puras en lib/resenas-reglas.ts, plan en docs/plan-resenas.md).
//
// - Huésped (sin cuenta): entra con el link único de su invitación (token HMAC, se guarda el hash,
//   cada link sirve para UN envío y vence a los 30 días del check-out).
// - Dueño: acciones con RLS (comoAdmin / ejecutar), igual que lib/panel-acciones.ts. No puede editar
//   ni borrar reseñas de su cabaña: solo responder y reportar.
// - Doble ciego (evaluarDesbloqueo): nada se muestra a la otra parte (ni al público) hasta que
//   están las dos reseñas o pasaron 14 días desde el check-out. Bloquea el ciclo (FOR UPDATE).
// - Lo que el panel no puede hacer con su rol (crear huéspedes y ciclos, publicar) lo hace el
//   servidor con `db` DESPUÉS de verificar con RLS que la reserva es del admin.
// Sin imports de Next: las Server Actions, las páginas y el cron la envuelven; los tests la llaman directo.

import { randomUUID } from "node:crypto";
import { avisarDueno, avisarHuesped } from "@/lib/aprobacion";
import { db } from "@/lib/db";
import type { Resultado } from "@/lib/estados-reserva";
import { formatearFechaLarga, hoyEnChile } from "@/lib/formato";
import type { Prisma } from "@/lib/generated/prisma/client";
import { enviarLinkAccesoHuesped } from "@/lib/notificaciones";
import { ErrorAccion, ejecutar } from "@/lib/panel-acciones";
import { comoAdmin, deSusPropiedades, idsPropiedades, type AdminSesion } from "@/lib/panel-acceso";
import { aFechaIso } from "@/lib/precios";
import {
  CATEGORIAS,
  DIAS_EDITAR_RESPUESTA,
  DIAS_PLAZO_RESENA,
  HORAS_LINK_ACCESO,
  LARGO_COMENTARIO,
  LARGO_MINIMO_COMENTARIO,
  MAXIMO_EDICIONES,
  MINUTOS_ENTRE_LINKS,
  MOTIVOS_REPORTE,
  debeDesbloquear,
  elegibilidad,
  esEtiqueta,
  etapaResenas,
  firmarToken,
  formaDeToken,
  hashToken,
  limpiarTexto,
  mensajePedirResena,
  nombrePublico,
  normalizarEmail,
  normalizarTelefonoHuesped,
  resenasHuespedActivas,
  resumenHistorial,
  secretoResenas,
  sumarDiasIso,
  tocaInvitar,
  tocaRecordatorio,
  venceTokenResena,
  type Calificacion,
  type MotivoReporte,
  type Notas,
  type ResenaPublica,
} from "@/lib/resenas-reglas";
import { urlDelSitio } from "@/lib/sitio";
import { enlaceWhatsapp } from "@/lib/whatsapp";

type Tx = Prisma.TransactionClient;
type Conexion = Tx | typeof db;

const DIA_MS = 86_400_000;
const ESTADOS_RESENABLES = ["confirmada", "completada"] as const;
const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const emailValido = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

// ---------------------------------------------------------------------------------------------
// Huésped y ciclo (servidor)
// ---------------------------------------------------------------------------------------------

type ReservaHuesped = { id: string; huespedId: string | null; huespedEmail: string; huespedTelefono: string; huespedNombre: string };

/**
 * Huésped de la reserva (lo crea si no existe, por email normalizado) y lo enlaza a la reserva.
 * null si la reserva no tiene un email usable (algunas de Airbnb/Booking/manuales).
 */
export async function asegurarHuesped(cx: Conexion, r: ReservaHuesped, poblado = false): Promise<string | null> {
  if (r.huespedId) return r.huespedId;
  const email = normalizarEmail(r.huespedEmail);
  if (!emailValido(email)) return null;
  const telefono = normalizarTelefonoHuesped(r.huespedTelefono);
  // ON CONFLICT DO NOTHING: dos procesos a la vez no se pisan ni abortan la transacción.
  await cx.huesped.createMany({
    data: [{ email, telefono, nombrePila: nombrePublico(r.huespedNombre), creadoPorPoblado: poblado }],
    skipDuplicates: true,
  });
  const h = await cx.huesped.findUniqueOrThrow({ where: { email }, select: { id: true, telefono: true } });
  if (!h.telefono && telefono) await cx.huesped.updateMany({ where: { id: h.id, telefono: null }, data: { telefono } });
  // SQL directo: Prisma actualizaría reserva.updated_at, y la reserva no cambia (solo se enlaza).
  await cx.$executeRaw`update reserva set huesped_id = ${h.id}::uuid where id = ${r.id}::uuid and huesped_id is null`;
  return h.id;
}

type Ciclo = { id: string; tokenVersion: number; tokenExpiraEn: Date; invitacionEnviadaEn: Date | null; recordatorioEn: Date | null; recordatorioDuenoEn: Date | null; desbloqueadoEn: Date | null };

/** Ciclo de reseñas de la reserva (con su token versión 0), creado una sola vez. */
export async function asegurarCiclo(cx: Conexion, reservaId: string, checkOut: string): Promise<Ciclo> {
  const existente = await cx.cicloResena.findUnique({ where: { reservaId } });
  if (existente) return existente;
  const id = randomUUID();
  await cx.cicloResena.createMany({
    data: [{ id, reservaId, tokenHash: hashToken(firmarToken(secretoResenas(), "resena", id, 0)), tokenExpiraEn: venceTokenResena(checkOut) }],
    skipDuplicates: true,
  });
  return cx.cicloResena.findUniqueOrThrow({ where: { reservaId } });
}

/** Link vigente de la invitación (el mismo en el correo, el recordatorio y WhatsApp). */
export const urlResenaDeCiclo = (c: Pick<Ciclo, "id" | "tokenVersion">) =>
  new URL(`/resena/${firmarToken(secretoResenas(), "resena", c.id, c.tokenVersion)}`, urlDelSitio()).toString();

// ---------------------------------------------------------------------------------------------
// Doble ciego
// ---------------------------------------------------------------------------------------------

/**
 * Publica las reseñas de la reserva si corresponde (ambas escritas, o 14 días desde el check-out).
 * Bloquea el ciclo: si las dos partes envían a la vez, la segunda ve la primera. true si desbloqueó.
 */
export async function evaluarDesbloqueo(reservaId: string, ahora = new Date()): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ id: string; desbloqueado_en: Date | null; check_out: Date }[]>`
      select c.id, c.desbloqueado_en, r.check_out
      from ciclo_resena c join reserva r on r.id = c.reserva_id
      where c.reserva_id = ${reservaId}::uuid
      for update of c`;
    if (filas.length === 0) return false;
    // En serie: una transacción usa una sola conexión.
    const cabana = await tx.resenaCabana.count({ where: { reservaId } });
    const huesped = await tx.resenaHuesped.count({ where: { reservaId } });
    const c = filas[0];
    const toca = debeDesbloquear(
      { checkOut: aFechaIso(c.check_out), hayResenaCabana: cabana > 0, hayResenaHuesped: huesped > 0, desbloqueado: c.desbloqueado_en !== null },
      hoyEnChile(ahora),
    );
    if (!toca) return false;
    await tx.cicloResena.update({ where: { id: c.id }, data: { desbloqueadoEn: ahora } });
    await tx.resenaCabana.updateMany({ where: { reservaId, estado: "retenida" }, data: { estado: "publicada", publicadaEn: ahora } });
    await tx.resenaHuesped.updateMany({ where: { reservaId, estado: "retenida" }, data: { estado: "publicada", publicadaEn: ahora } });
    return true;
  });
}

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
      cabana: { select: { nombre: true, slug: true, demo: true, propiedad: { select: { nombre: true, slug: true } } } },
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
  const el = elegibilidad({ estado: r.estado, checkOut: aFechaIso(r.checkOut), demo: r.cabana.demo }, hoyEnChile(ahora));
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
      const el = elegibilidad({ estado: c.reserva.estado, checkOut: aFechaIso(c.reserva.checkOut), demo: c.reserva.cabana.demo }, hoyEnChile(ahora));
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

// ---------------------------------------------------------------------------------------------
// Página pública de la cabaña
// ---------------------------------------------------------------------------------------------

/** Máximo de reseñas que trae la página de la cabaña. */
export const MAXIMO_RESENAS_PUBLICAS = 100;

/**
 * Reseñas PUBLICADAS de una cabaña, sin datos personales (solo nombre de pila). Lo único que lee la
 * parte pública: ni retenidas ni ocultas. shortcut: tope de 100, paginar en la base si alguna cabaña lo pasa.
 */
export async function resenasPublicas(cabanaId: string): Promise<ResenaPublica[]> {
  const filas = await db.resenaCabana.findMany({
    where: { cabanaId, estado: "publicada" },
    select: {
      id: true,
      nombrePublico: true,
      comentario: true,
      publicadaEn: true,
      limpieza: true,
      ubicacion: true,
      comunicacion: true,
      veracidad: true,
      calidadPrecio: true,
      respuesta: { select: { texto: true } },
    },
    orderBy: { publicadaEn: "desc" },
    take: MAXIMO_RESENAS_PUBLICAS,
  });
  return filas.map(({ nombrePublico: nombre, respuesta, publicadaEn, ...r }) => ({
    ...r,
    nombre,
    publicadaEn: publicadaEn ?? new Date(0),
    respuesta: respuesta?.texto ?? null,
  }));
}

// ---------------------------------------------------------------------------------------------
// Dueño: reseñas de sus cabañas (respuesta, reporte, pedir por WhatsApp)
// ---------------------------------------------------------------------------------------------

/** Reseñas de las cabañas del admin (sin retenidas: RLS) y estadías recientes que pueden reseñarse. */
export async function datosResenasPanel(admin: AdminSesion, hoy: string) {
  const ahora = Date.now();
  const { resenas, recientes } = await comoAdmin(admin, async (tx) => ({
    resenas: await tx.resenaCabana.findMany({
      where: { cabana: { propiedadId: { in: idsPropiedades(admin) } } },
      select: {
        id: true,
        nombrePublico: true,
        comentario: true,
        estado: true,
        publicadaEn: true,
        limpieza: true,
        ubicacion: true,
        comunicacion: true,
        veracidad: true,
        calidadPrecio: true,
        cabana: { select: { nombre: true } },
        reserva: { select: { codigo: true } },
        respuesta: { select: { texto: true, createdAt: true } },
        reportes: { where: { usuarioId: admin.usuarioId }, select: { estado: true, motivo: true } },
      },
      orderBy: { publicadaEn: "desc" },
      take: 100,
    }),
    recientes: await tx.reserva.findMany({
      where: {
        ...deSusPropiedades(admin),
        estado: { in: [...ESTADOS_RESENABLES] },
        checkOut: { gte: fecha(sumarDiasIso(hoy, -DIAS_PLAZO_RESENA)), lte: fecha(hoy) },
        cabana: { demo: false },
      },
      select: {
        codigo: true,
        huespedNombre: true,
        checkOut: true,
        cabana: { select: { nombre: true } },
        resenaHuesped: { select: { estado: true } },
        cicloResena: { select: { invitacionEnviadaEn: true, whatsappAbiertoEn: true, desbloqueadoEn: true } },
      },
      orderBy: { checkOut: "desc" },
    }),
  }));
  return {
    resenas: resenas.map((r) => ({
      ...r,
      respuestaEditable: !r.respuesta || ahora - r.respuesta.createdAt.getTime() <= DIAS_EDITAR_RESPUESTA * DIA_MS,
    })),
    recientes: recientes.map((r) => ({ ...r, checkOut: aFechaIso(r.checkOut) })),
  };
}

/** Busca una reseña de las cabañas del admin (RLS: nunca una retenida). */
async function resenaDelAdmin(tx: Tx, admin: AdminSesion, resenaId: string) {
  const r = await tx.resenaCabana.findFirst({
    where: { id: resenaId, cabana: { propiedadId: { in: idsPropiedades(admin) } } },
    select: { id: true, estado: true, respuesta: { select: { id: true, createdAt: true } } },
  });
  if (!r) throw new ErrorAccion("No encontramos esa reseña en tus cabañas.");
  return r;
}

/** Respuesta pública del dueño: una por reseña, editable durante 14 días desde que la escribió. */
export function responderResena(admin: AdminSesion, resenaId: string, texto: string, ahora = new Date()) {
  const limpio = limpiarTexto(texto, LARGO_COMENTARIO);
  return ejecutar(admin, async (tx) => {
    if (!limpio) throw new ErrorAccion("Escribe tu respuesta.");
    const r = await resenaDelAdmin(tx, admin, resenaId);
    if (r.estado !== "publicada") throw new ErrorAccion("Solo se responden reseñas publicadas.");
    const datos = { texto: limpio, autorUsuarioId: admin.usuarioId, autorEmail: admin.email };
    if (r.respuesta) {
      if (ahora.getTime() - r.respuesta.createdAt.getTime() > DIAS_EDITAR_RESPUESTA * DIA_MS) {
        throw new ErrorAccion(`El plazo para editar tu respuesta terminó (${DIAS_EDITAR_RESPUESTA} días).`);
      }
      await tx.respuestaResena.update({ where: { id: r.respuesta.id }, data: datos });
      return { nuevo: false };
    }
    await tx.respuestaResena.create({ data: { resenaId, ...datos } });
    return { nuevo: true };
  });
}

/** El dueño reporta una reseña: queda en la cola del superadmin. Un reporte pendiente por usuario y reseña. */
export function reportarResena(admin: AdminSesion, resenaId: string, motivo: MotivoReporte, detalle?: string) {
  return ejecutar(admin, async (tx) => {
    if (!Object.hasOwn(MOTIVOS_REPORTE, motivo)) throw new ErrorAccion("Elige un motivo.");
    await resenaDelAdmin(tx, admin, resenaId);
    const ya = await tx.reporteResena.findFirst({ where: { resenaId, usuarioId: admin.usuarioId, estado: "pendiente" }, select: { id: true } });
    if (ya) return { nuevo: false };
    await tx.reporteResena.create({
      data: { resenaId, motivo, detalle: limpiarTexto(detalle, 500) || null, usuarioId: admin.usuarioId, email: admin.email },
    });
    return { nuevo: true };
  });
}

/** Reserva del admin con lo necesario para las reseñas, o null (filtro + RLS). */
function reservaParaResena(admin: AdminSesion, codigo: string) {
  return comoAdmin(admin, (tx) =>
    tx.reserva.findFirst({
      where: { codigo, ...deSusPropiedades(admin) },
      select: {
        id: true,
        estado: true,
        checkOut: true,
        huespedId: true,
        huespedNombre: true,
        huespedEmail: true,
        huespedTelefono: true,
        cabana: { select: { nombre: true, demo: true, propiedadId: true } },
      },
    }),
  );
}

/**
 * Link de WhatsApp para pedir la reseña (el MISMO link del correo) y registra que el dueño lo abrió
 * ("abierto", no "entregado").
 */
export async function pedirResenaPorWhatsapp(admin: AdminSesion, codigo: string, ahora = new Date()): Promise<Resultado<{ url: string }>> {
  const r = await reservaParaResena(admin, codigo);
  if (!r) return { ok: false, error: "No encontramos esa reserva en tus propiedades." };
  const el = elegibilidad({ estado: r.estado, checkOut: aFechaIso(r.checkOut), demo: r.cabana.demo }, hoyEnChile(ahora));
  if (!el.ok) return { ok: false, error: el.motivo };
  const ciclo = await asegurarCiclo(db, r.id, aFechaIso(r.checkOut));
  const url = enlaceWhatsapp(r.huespedTelefono, mensajePedirResena({ nombre: r.huespedNombre, cabana: r.cabana.nombre, url: urlResenaDeCiclo(ciclo) }));
  if (!url) return { ok: false, error: "El huésped no dejó un teléfono válido." };
  await comoAdmin(admin, (tx) => tx.cicloResena.update({ where: { reservaId: r.id }, data: { whatsappAbiertoEn: ahora } }));
  return { ok: true, url };
}

// ---------------------------------------------------------------------------------------------
// Dueño: reseña PRIVADA del huésped e historial
// ---------------------------------------------------------------------------------------------

export function validarResenaHuesped(d: { calificacion: unknown; etiquetas: unknown[]; comentario: unknown }) {
  const calificacion = String(d.calificacion);
  if (!["recomendado", "con_reservas", "no_recomendado"].includes(calificacion)) {
    return { ok: false as const, error: "Elige una calificación." };
  }
  return {
    ok: true as const,
    calificacion: calificacion as Calificacion,
    etiquetas: [...new Set(d.etiquetas.map(String).filter(esEtiqueta))],
    comentario: limpiarTexto(d.comentario, LARGO_COMENTARIO) || null,
  };
}

/** Escribe (o edita, mientras está retenida) la reseña privada del huésped de una reserva. */
export async function escribirResenaHuesped(
  admin: AdminSesion,
  codigo: string,
  datos: { calificacion: unknown; etiquetas: unknown[]; comentario: unknown },
  ahora = new Date(),
): Promise<Resultado<{ nuevo: boolean }>> {
  const v = validarResenaHuesped(datos);
  if (!v.ok) return v;
  const r = await reservaParaResena(admin, codigo);
  if (!r) return { ok: false, error: "No encontramos esa reserva en tus propiedades." };
  const el = elegibilidad({ estado: r.estado, checkOut: aFechaIso(r.checkOut), demo: r.cabana.demo }, hoyEnChile(ahora));
  if (!el.ok) return { ok: false, error: el.motivo };

  // El huésped y el ciclo los crea el servidor (el rol del panel no puede), ya verificada la reserva.
  const huespedId = await asegurarHuesped(db, r);
  if (!huespedId) return { ok: false, error: "La reserva no tiene un email válido del huésped." };
  await asegurarCiclo(db, r.id, aFechaIso(r.checkOut));

  const res = await ejecutar(admin, async (tx) => {
    const [c] = await tx.$queryRaw<{ desbloqueado_en: Date | null }[]>`
      select desbloqueado_en from ciclo_resena where reserva_id = ${r.id}::uuid for update`;
    const contenido = { calificacion: v.calificacion, etiquetas: v.etiquetas, comentario: v.comentario };
    const existente = await tx.resenaHuesped.findUnique({ where: { reservaId: r.id }, select: { estado: true } });
    if (existente) {
      if (existente.estado !== "retenida") throw new ErrorAccion("Tu reseña ya se publicó y no se puede editar.");
      await tx.resenaHuesped.update({ where: { reservaId: r.id }, data: contenido });
      return { nuevo: false };
    }
    const publicar = c?.desbloqueado_en != null;
    await tx.resenaHuesped.create({
      data: {
        reservaId: r.id,
        propiedadId: r.cabana.propiedadId,
        huespedId,
        autorUsuarioId: admin.usuarioId,
        autorEmail: admin.email,
        ...contenido,
        estado: publicar ? "publicada" : "retenida",
        publicadaEn: publicar ? ahora : null,
      },
    });
    return { nuevo: true };
  });
  if (res.ok) await evaluarDesbloqueo(r.id, ahora);
  return res;
}

/**
 * Historial del huésped CON ESTE DUEÑO (sus propiedades): estadías, resumen y detalle de sus
 * reseñas (con la réplica del huésped). Con compartir_reputacion encendido suma el resumen (sin
 * comentarios) de otros dueños, por la vista reputacion_compartida. Nunca va a páginas públicas.
 */
export async function historialHuesped(admin: AdminSesion, contacto: { email: string; telefono: string | null }, hoy: string) {
  const email = normalizarEmail(contacto.email);
  const telefono = normalizarTelefonoHuesped(contacto.telefono);
  // Identidad por email o teléfono normalizados (lectura del servidor; lo que se muestra pasa por RLS).
  const ids = (
    await db.huesped.findMany({ where: { OR: [{ email }, ...(telefono ? [{ telefono }] : [])] }, select: { id: true } })
  ).map((h) => h.id);

  return comoAdmin(admin, async (tx) => {
    const estadias = await tx.reserva.count({
      where: {
        ...deSusPropiedades(admin),
        estado: { in: [...ESTADOS_RESENABLES] },
        checkOut: { lte: fecha(hoy) },
        OR: [{ huespedId: { in: ids } }, { huespedEmail: { equals: email, mode: "insensitive" } }],
      },
    });
    const propias = ids.length
      ? await tx.resenaHuesped.findMany({
          where: { huespedId: { in: ids } },
          select: {
            id: true,
            calificacion: true,
            etiquetas: true,
            comentario: true,
            estado: true,
            createdAt: true,
            autorEmail: true,
            reserva: { select: { codigo: true, checkIn: true, cabana: { select: { nombre: true } } } },
            replica: { select: { texto: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const deOtros = ids.length
      ? await tx.$queryRaw<{ calificacion: Calificacion; etiquetas: string[] }[]>`
          select calificacion::text as calificacion, etiquetas from reputacion_compartida
          where huesped_id = any(${ids}::uuid[]) and not (propiedad_id = any(${idsPropiedades(admin)}::uuid[]))`
      : [];
    return {
      resumen: resumenHistorial(estadias, propias),
      otros: deOtros.length ? resumenHistorial(deOtros.length, deOtros) : null,
      resenas: propias.map((p) => ({ ...p, reserva: { ...p.reserva, checkIn: aFechaIso(p.reserva.checkIn) } })),
    };
  });
}

export type HistorialHuesped = Awaited<ReturnType<typeof historialHuesped>>;

/** Estado de las reseñas de una reserva para su detalle en el panel. */
export async function resenasDeReserva(admin: AdminSesion, codigo: string, ahora = new Date()) {
  const r = await comoAdmin(admin, (tx) =>
    tx.reserva.findFirst({
      where: { codigo, ...deSusPropiedades(admin) },
      select: {
        estado: true,
        checkOut: true,
        cabana: { select: { demo: true } },
        resenaHuesped: { select: { calificacion: true, etiquetas: true, comentario: true, estado: true } },
        resenaCabana: { select: { id: true, estado: true } }, // RLS: null mientras esté retenida
        cicloResena: { select: { invitacionEnviadaEn: true, whatsappAbiertoEn: true, desbloqueadoEn: true } },
      },
    }),
  );
  if (!r) return null;
  const el = elegibilidad({ estado: r.estado, checkOut: aFechaIso(r.checkOut), demo: r.cabana.demo }, hoyEnChile(ahora));
  return {
    elegible: el.ok,
    motivo: el.ok ? null : el.motivo,
    resenaHuesped: r.resenaHuesped,
    resenaCabanaVisible: r.resenaCabana !== null,
    ciclo: r.cicloResena,
  };
}

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
  const resultado = await enviarLinkAccesoHuesped(h.email, new URL(`/mis-datos/${token}`, urlDelSitio()).toString());
  if (!resultado.ok) console.error("No se pudo enviar el link de acceso del huésped", h.id, resultado.error);
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

// ---------------------------------------------------------------------------------------------
// Superadmin (Soluciones DyS): cola de moderación
// ---------------------------------------------------------------------------------------------

export function cargarSuperadmin(usuarioId: string) {
  return db.superadmin.findUnique({ where: { usuarioId }, select: { usuarioId: true, email: true } });
}

export type Superadmin = NonNullable<Awaited<ReturnType<typeof cargarSuperadmin>>>;

export async function colaModeracion() {
  const [reportes, solicitudes] = await Promise.all([
    db.reporteResena.findMany({
      where: { estado: "pendiente" },
      select: {
        id: true,
        motivo: true,
        detalle: true,
        email: true,
        createdAt: true,
        resena: {
          select: {
            id: true,
            estado: true,
            nombrePublico: true,
            comentario: true,
            cabana: { select: { nombre: true, propiedad: { select: { nombre: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.solicitudPrivacidad.findMany({
      where: { estado: "pendiente" },
      select: { id: true, tipo: true, mensaje: true, createdAt: true, huesped: { select: { email: true, nombrePila: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { reportes, solicitudes };
}

/** Resuelve un reporte: ocultar la reseña (se conserva en la base) o descartarlo. */
export async function resolverReporte(sa: Superadmin, reporteId: string, ocultar: boolean, ahora = new Date()): Promise<Resultado> {
  return db.$transaction(async (tx) => {
    const rep = await tx.reporteResena.findUnique({ where: { id: reporteId }, select: { resenaId: true, estado: true } });
    if (!rep || rep.estado !== "pendiente") return { ok: false as const, error: "Ese reporte ya se resolvió." };
    const resuelto = { resueltoPor: sa.email, resueltoEn: ahora };
    if (ocultar) {
      await tx.resenaCabana.update({ where: { id: rep.resenaId }, data: { estado: "oculta" } });
      // Los demás reportes pendientes de la misma reseña quedan resueltos con ella.
      await tx.reporteResena.updateMany({ where: { resenaId: rep.resenaId, estado: "pendiente" }, data: { estado: "aceptado", ...resuelto } });
    } else {
      await tx.reporteResena.update({ where: { id: reporteId }, data: { estado: "descartado", ...resuelto } });
    }
    return { ok: true as const };
  });
}

/** Marca una solicitud de privacidad como atendida (la rectificación o eliminación se hace a mano). */
export async function atenderSolicitudPrivacidad(sa: Superadmin, id: string, ahora = new Date()): Promise<Resultado> {
  const { count } = await db.solicitudPrivacidad.updateMany({
    where: { id, estado: "pendiente" },
    data: { estado: "aceptado", resueltoPor: sa.email, resueltoEn: ahora },
  });
  return count ? { ok: true } : { ok: false, error: "Esa solicitud ya se atendió." };
}

// ---------------------------------------------------------------------------------------------
// Cron (app/api/cron/resenas): invitaciones, recordatorios y desbloqueo. Idempotente: cada envío se
// "reserva" marcando su columna solo si estaba en null, así dos corridas no lo envían dos veces.
// Los tokens no se borran al vencer: se rechazan por fecha (token_expira_en).
// ---------------------------------------------------------------------------------------------

export async function procesarResenas(ahora = new Date()) {
  const etapa = etapaResenas();
  if (etapa === "apagadas") return { etapa };
  const hoy = hoyEnChile(ahora);
  const marcar = async (id: string, campo: "invitacionEnviadaEn" | "recordatorioEn" | "recordatorioDuenoEn") =>
    (await db.cicloResena.updateMany({ where: { id, [campo]: null }, data: { [campo]: ahora } })).count === 1;

  let invitaciones = 0;
  let recordatorios = 0;
  let recordatoriosDueno = 0;
  const estadias = await db.reserva.findMany({
    where: {
      estado: { in: [...ESTADOS_RESENABLES] },
      checkOut: { gte: fecha(sumarDiasIso(hoy, -DIAS_PLAZO_RESENA)), lt: fecha(hoy) },
      cabana: { demo: false },
    },
    select: {
      id: true,
      codigo: true,
      checkOut: true,
      huespedId: true,
      huespedEmail: true,
      huespedTelefono: true,
      huespedNombre: true,
      resenaCabana: { select: { id: true } },
      resenaHuesped: { select: { id: true } },
    },
  });
  for (const r of estadias) {
    const checkOut = aFechaIso(r.checkOut);
    await asegurarHuesped(db, r);
    const ciclo = await asegurarCiclo(db, r.id, checkOut);
    const url = () => urlResenaDeCiclo(ciclo);

    if (!r.resenaCabana && !ciclo.invitacionEnviadaEn && tocaInvitar(checkOut, hoy) && (await marcar(ciclo.id, "invitacionEnviadaEn"))) {
      invitaciones++;
      await avisarHuesped(r.codigo, "invitacion_resena", null, url());
    } else if (
      tocaRecordatorio({ checkOut, invitacionEnviadaEn: ciclo.invitacionEnviadaEn, recordatorioEn: ciclo.recordatorioEn, respondio: !!r.resenaCabana }, hoy) &&
      (await marcar(ciclo.id, "recordatorioEn"))
    ) {
      recordatorios++;
      await avisarHuesped(r.codigo, "recordatorio_resena", null, url());
    }

    // Al dueño, al día siguiente del check-out (misma ventana que la invitación).
    if (
      resenasHuespedActivas() &&
      !r.resenaHuesped &&
      !ciclo.recordatorioDuenoEn &&
      tocaInvitar(checkOut, hoy) &&
      (await marcar(ciclo.id, "recordatorioDuenoEn"))
    ) {
      recordatoriosDueno++;
      await avisarDueno(r.codigo, "resena_huesped_pendiente");
    }
  }

  let desbloqueos = 0;
  for (const c of await db.cicloResena.findMany({ where: { desbloqueadoEn: null }, select: { reservaId: true } })) {
    if (await evaluarDesbloqueo(c.reservaId, ahora)) desbloqueos++;
  }

  return { etapa, invitaciones, recordatorios, recordatoriosDueno, desbloqueos };
}
