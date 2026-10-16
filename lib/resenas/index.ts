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

import { avisarDueno, avisarHuesped } from "@/lib/aprobacion";
import { db } from "@/lib/db";
import { cupoCorreo } from "@/lib/limites";
import type { Resultado } from "@/lib/estados-reserva";
import { formatearFechaLarga, hoyEnChile } from "@/lib/formato";
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
  esEtiqueta,
  firmarToken,
  formaDeToken,
  hashToken,
  limpiarTexto,
  mensajePedirResena,
  nombrePublico,
  normalizarEmail,
  normalizarTelefonoHuesped,
  resenasCabanaActivas,
  resenasHuespedActivas,
  resumenHistorial,
  secretoResenas,
  sumarDiasIso,
  tocaInvitar,
  tocaRecordatorio,
  type Calificacion,
  type MotivoReporte,
  type Notas,
  type ResenaPublica,
} from "@/lib/resenas-reglas";
import { urlDelSitio } from "@/lib/sitio";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { registrar, detalleError } from "@/lib/registro";
import {
  type Tx,
  DIA_MS,
  ESTADOS_RESENABLES,
  fecha,
  emailValido,
  asegurarHuesped,
  asegurarCiclo,
  urlResenaDeCiclo,
  elegible,
  evaluarDesbloqueo,
} from "@/lib/resenas/comun";

export { asegurarHuesped, asegurarCiclo, urlResenaDeCiclo, evaluarDesbloqueo } from "@/lib/resenas/comun";
export {
  cargarSuperadmin,
  type Superadmin,
  colaModeracion,
  resolverReporte,
  atenderSolicitudPrivacidad,
} from "@/lib/resenas/moderacion";

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

// ---------------------------------------------------------------------------------------------
// Página pública de la cabaña
// ---------------------------------------------------------------------------------------------

/** Máximo de reseñas que trae la página de la cabaña. */
export const MAXIMO_RESENAS_PUBLICAS = 100;

/**
 * Reseñas PUBLICADAS de una cabaña, sin datos personales (solo nombre de pila). Lo único que lee la
 * parte pública: ni retenidas, ni ocultas, ni de reservas de prueba (es_prueba: nunca llegan a la
 * página ni al JSON-LD). shortcut: tope de 100, paginar en la base si alguna cabaña lo pasa.
 */
export async function resenasPublicas(cabanaId: string): Promise<ResenaPublica[]> {
  const filas = await db.resenaCabana.findMany({
    where: {
      cabanaId,
      estado: "publicada",
      reserva: { esPrueba: false },
    },
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
  // Solo las propiedades del admin con reseñas activas.
  const ids = admin.propiedades.filter((p) => resenasCabanaActivas(p.resenas)).map((p) => p.id);
  const { resenas, recientes } = await comoAdmin(admin, async (tx) => ({
    resenas: await tx.resenaCabana.findMany({
      where: { cabana: { propiedadId: { in: ids } } },
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
        reserva: { select: { codigo: true, esPrueba: true } },
        respuesta: { select: { texto: true, createdAt: true } },
        reportes: { where: { usuarioId: admin.usuarioId }, select: { estado: true, motivo: true } },
      },
      orderBy: { publicadaEn: "desc" },
      take: 100,
    }),
    recientes: await tx.reserva.findMany({
      where: {
        estado: { in: [...ESTADOS_RESENABLES] },
        checkOut: { gte: fecha(sumarDiasIso(hoy, -DIAS_PLAZO_RESENA)), lte: fecha(hoy) },
        cabana: { propiedadId: { in: ids }, demo: false },
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
      prueba: r.reserva.esPrueba, // nunca sale en la página pública
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
        cabana: { select: { nombre: true, demo: true, propiedadId: true, propiedad: { select: { resenas: true, suspendida: true } } } },
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
  const el = elegible(r, hoyEnChile(ahora));
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
  const el = elegible(r, hoyEnChile(ahora), true);
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
        cabana: { select: { demo: true, propiedad: { select: { resenas: true, suspendida: true } } } },
        resenaHuesped: { select: { calificacion: true, etiquetas: true, comentario: true, estado: true } },
        resenaCabana: { select: { id: true, estado: true } }, // RLS: null mientras esté retenida
        cicloResena: { select: { invitacionEnviadaEn: true, whatsappAbiertoEn: true, desbloqueadoEn: true } },
      },
    }),
  );
  if (!r) return null;
  const el = elegible(r, hoyEnChile(ahora), true);
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

// ---------------------------------------------------------------------------------------------
// Cron (app/api/cron/resenas): invitaciones, recordatorios y desbloqueo, en las propiedades con
// reseñas activas (las demás no reciben correos; el desbloqueo de lo ya escrito sigue en todas). Idempotente: cada envío se
// "reserva" marcando su columna solo si estaba en null, así dos corridas no lo envían dos veces.
// Los tokens no se borran al vencer: se rechazan por fecha (token_expira_en).
// ---------------------------------------------------------------------------------------------

export async function procesarResenas(ahora = new Date()) {
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
      // Solo propiedades con reseñas activas y no suspendidas.
      cabana: { demo: false, propiedad: { suspendida: false, resenas: { not: "apagadas" } } },
    },
    select: {
      id: true,
      codigo: true,
      cabana: { select: { propiedad: { select: { resenas: true } } } },
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
      resenasHuespedActivas(r.cabana.propiedad.resenas) &&
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

  return { invitaciones, recordatorios, recordatoriosDueno, desbloqueos };
}
