// Aprobación manual de reservas ("solicitud de reserva"), por cabaña (cabana.requiere_aprobacion).
//
// pendiente_aprobacion ──aprobar──▶ aprobada_pendiente_pago ──pago (webhook)──▶ confirmada
//        │ rechazar / plazo vencido          │ link vencido / cancelar
//        ▼                                   ▼
//   rechazada / expirada                expirada / cancelada
//
// - Las acciones del dueño siguen el patrón de lib/panel-acciones.ts: una transacción con RLS, la
//   fila bloqueada (FOR UPDATE), revalidación con el estado de la base y auditoría.
// - Idempotencia: aprobar o rechazar dos veces devuelve `nuevo: false` y no crea otro link ni envía
//   otro correo (quien llama solo avisa si `nuevo`).
// - Los avisos (lib/notificaciones.ts) nunca lanzan; si fallan, quedan en reserva.aviso_fallido.
// Sin imports de Next: las Server Actions y el cron la envuelven; los tests la llaman directo.

import { db } from "@/lib/db";
import { cerrojoCabana } from "@/lib/errores-db";
import { expirarReservasVencidas, MARCA_PRUEBA } from "@/lib/reservas";
import { formatearCLP, formatearFechaHora, formatearFechaLarga } from "@/lib/formato";
import { crearLinkPagoSolicitud } from "@/lib/mercadopago";
import {
  NOMBRE_AVISO,
  notificarDueno,
  notificarHuesped,
  type DatosAviso,
  type PlantillaDueno,
  type PlantillaHuesped,
  type ResultadoAviso,
} from "@/lib/notificaciones";
import { auditar, bloquearReserva, ErrorAccion, ejecutar } from "@/lib/panel-acciones";
import { comoAdmin, deSusPropiedades, idsPropiedades, type AdminSesion } from "@/lib/panel-acceso";
import { aFechaIso, nochesEntre } from "@/lib/precios";
import { urlDelSitio } from "@/lib/sitio";
import { HORAS_MAXIMAS, HORAS_MINIMAS, HORAS_RECORDATORIO, limpiarMotivoRechazo, recordarAlDueno, recordarAlHuesped } from "@/lib/solicitudes";

const HORA_MS = 3_600_000;

/** Aprobar crea el link en Mercado Pago con la fila bloqueada: más plazo que los 5 s por defecto. */
const CON_MERCADOPAGO = { timeout: 30_000 };

// ---------------------------------------------------------------------------------------------
// Acciones del dueño
// ---------------------------------------------------------------------------------------------

/**
 * Aprueba una solicitud: crea en ese momento el link de pago (Mercado Pago, con la cuenta de la
 * propiedad, vence en `horas_para_pagar` de la cabaña) y la deja en aprobada_pendiente_pago.
 * Las fechas siguen retenidas (la restricción de la base incluye ese estado).
 */
export function aprobarSolicitud(admin: AdminSesion, codigo: string, ahora = new Date()) {
  return ejecutar(
    admin,
    async (tx) => {
      const r = await bloquearReserva(tx, admin, codigo);
      // Doble clic: la segunda llamada espera el cerrojo de la fila y encuentra la reserva ya aprobada.
      if (r.estado === "aprobada_pendiente_pago") return { estado: r.estado, nuevo: false };
      if (r.estado !== "pendiente_aprobacion") throw new ErrorAccion("Esta reserva no es una solicitud pendiente.");

      const extra = await tx.reserva.findUniqueOrThrow({
        where: { id: r.id },
        select: { expiraEn: true, cabana: { select: { horasParaPagar: true } } },
      });
      if (extra.expiraEn && extra.expiraEn <= ahora) {
        throw new ErrorAccion("Esta solicitud ya expiró y las fechas se liberaron.");
      }

      const vence = new Date(ahora.getTime() + extra.cabana.horasParaPagar * HORA_MS);
      const link = await crearLinkPagoSolicitud(codigo, vence);
      if (!link.ok) throw new ErrorAccion(`No pudimos crear el link de pago: ${link.error}`);

      await tx.reserva.update({
        where: { id: r.id },
        data: { estado: "aprobada_pendiente_pago", aprobadaEn: ahora, expiraEn: vence, linkPago: link.url, linkPagoExpiraEn: vence },
      });
      await auditar(tx, admin, {
        reservaId: r.id,
        accion: "aprobar",
        antes: r.estado,
        despues: "aprobada_pendiente_pago",
        detalle: `Link de pago hasta el ${formatearFechaHora(vence)}`,
      });
      return { estado: "aprobada_pendiente_pago" as const, nuevo: true };
    },
    CON_MERCADOPAGO,
  );
}

/** Rechaza una solicitud pendiente y libera las fechas. El motivo es opcional y se le muestra al huésped. */
export function rechazarSolicitud(admin: AdminSesion, codigo: string, motivo?: string | null) {
  const limpio = limpiarMotivoRechazo(motivo);
  return ejecutar(admin, async (tx) => {
    const r = await bloquearReserva(tx, admin, codigo);
    if (r.estado === "rechazada") return { estado: r.estado, nuevo: false, motivo: limpio };
    if (r.estado !== "pendiente_aprobacion") {
      throw new ErrorAccion("Solo se rechazan solicitudes pendientes. Una aprobada se cancela.");
    }
    await tx.reserva.update({ where: { id: r.id }, data: { estado: "rechazada", expiraEn: null } });
    await auditar(tx, admin, { reservaId: r.id, accion: "rechazar", antes: r.estado, despues: "rechazada", detalle: limpio ?? undefined });
    return { estado: "rechazada" as const, nuevo: true, motivo: limpio };
  });
}

/**
 * Genera un link de pago nuevo para una solicitud aprobada cuyo link venció (aún sin marcar, o ya
 * `expirada`). Vuelve a retener las fechas: si otra reserva o un bloqueo las tomó, no se puede.
 */
export function renovarLinkPago(admin: AdminSesion, codigo: string, ahora = new Date()) {
  return ejecutar(
    admin,
    async (tx) => {
      const r = await bloquearReserva(tx, admin, codigo);
      const extra = await tx.reserva.findUniqueOrThrow({
        where: { id: r.id },
        select: { aprobadaEn: true, linkPagoExpiraEn: true, cabana: { select: { horasParaPagar: true } } },
      });
      const vencido = !extra.linkPagoExpiraEn || extra.linkPagoExpiraEn <= ahora;
      if (r.estado === "aprobada_pendiente_pago" && !vencido) {
        throw new ErrorAccion("El link de pago sigue vigente. Puedes reenviar el correo o enviarlo por WhatsApp.");
      }
      if (!(r.estado === "aprobada_pendiente_pago" || (r.estado === "expirada" && extra.aprobadaEn))) {
        throw new ErrorAccion("Solo se renueva el link de una solicitud aprobada.");
      }

      await cerrojoCabana(tx, r.cabana_id);
      const bloqueos = await tx.bloqueo.count({
        where: { cabanaId: r.cabana_id, desde: { lt: r.check_out }, hasta: { gt: r.check_in } },
      });
      if (bloqueos > 0) throw new ErrorAccion("Hay fechas bloqueadas dentro de esta estadía. Quita el bloqueo antes de renovar el link.");

      const vence = new Date(ahora.getTime() + extra.cabana.horasParaPagar * HORA_MS);
      const link = await crearLinkPagoSolicitud(codigo, vence);
      if (!link.ok) throw new ErrorAccion(`No pudimos crear el link de pago: ${link.error}`);

      // Si otra reserva activa tomó esas fechas, Postgres rechaza el cambio (reserva_sin_traslape).
      await tx.reserva.update({
        where: { id: r.id },
        data: {
          estado: "aprobada_pendiente_pago",
          expiraEn: vence,
          linkPago: link.url,
          linkPagoExpiraEn: vence,
          recordatorioHuespedEn: null,
          expiracionAvisadaEn: null,
          whatsappAbiertoEn: null,
        },
      });
      await auditar(tx, admin, {
        reservaId: r.id,
        accion: "nuevo_link_pago",
        antes: r.estado,
        despues: "aprobada_pendiente_pago",
        detalle: `Link de pago hasta el ${formatearFechaHora(vence)}`,
      });
      return { estado: "aprobada_pendiente_pago" as const };
    },
    CON_MERCADOPAGO,
  );
}

/** Registra que el dueño abrió WhatsApp con el link de pago ("abierto", no "entregado"). */
export async function registrarWhatsappAbierto(admin: AdminSesion, codigo: string, ahora = new Date()): Promise<boolean> {
  const { count } = await comoAdmin(admin, (tx) =>
    tx.reserva.updateMany({
      where: { codigo, estado: "aprobada_pendiente_pago", ...deSusPropiedades(admin) },
      data: { whatsappAbiertoEn: ahora },
    }),
  );
  return count === 1;
}

export interface ConfigAprobacion {
  requiereAprobacion: boolean;
  horasRespuestaAprobacion: number;
  horasParaPagar: number;
}

/**
 * Cambia la aprobación manual de UNA cabaña. Solo el rol `dueno` de su propiedad (también lo exige
 * RLS: panel_admin solo puede actualizar esas tres columnas, y solo como dueño). Afecta las reservas
 * NUEVAS: las solicitudes ya creadas siguen su flujo hasta resolverse.
 */
export function configurarAprobacion(admin: AdminSesion, cabanaId: string, cfg: ConfigAprobacion) {
  for (const horas of [cfg.horasRespuestaAprobacion, cfg.horasParaPagar]) {
    if (!Number.isInteger(horas) || horas < HORAS_MINIMAS || horas > HORAS_MAXIMAS) {
      return Promise.resolve({ ok: false as const, error: `Los plazos van de ${HORAS_MINIMAS} a ${HORAS_MAXIMAS} horas.` });
    }
  }
  const comoDueno = admin.propiedades.filter((p) => p.rol === "dueno").map((p) => p.id);
  return ejecutar(admin, async (tx) => {
    const cabana = await tx.cabana.findFirst({
      where: { id: cabanaId, propiedadId: { in: idsPropiedades(admin) } },
      select: { id: true, propiedadId: true },
    });
    if (!cabana) throw new ErrorAccion("No encontramos esa cabaña en tus propiedades.");
    if (!comoDueno.includes(cabana.propiedadId)) throw new ErrorAccion("Solo el dueño de la propiedad puede cambiar esta configuración.");

    // SQL directo: Prisma agregaría updated_at, que panel_admin no puede escribir (solo estas columnas).
    const cambiadas = await tx.$executeRaw`
      update cabana set
        requiere_aprobacion = ${cfg.requiereAprobacion},
        horas_respuesta_aprobacion = ${cfg.horasRespuestaAprobacion},
        horas_para_pagar = ${cfg.horasParaPagar}
      where id = ${cabana.id}::uuid`;
    if (cambiadas !== 1) throw new ErrorAccion("No tienes permiso para cambiar esta cabaña.");

    await tx.auditoria.create({
      data: {
        cabanaId: cabana.id,
        usuarioId: admin.usuarioId,
        email: admin.email,
        accion: "configurar_cabana",
        detalle: cfg.requiereAprobacion
          ? `Aprobación manual activada: responder en ${cfg.horasRespuestaAprobacion} h, pagar en ${cfg.horasParaPagar} h`
          : "Aprobación manual desactivada",
      },
    });
    return {};
  });
}

// ---------------------------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------------------------

/** Datos de una reserva para sus avisos, o null si no existe. */
async function cargarDatosAviso(codigo: string, motivo: string | null = null): Promise<{ id: string; datos: DatosAviso } | null> {
  const r = await db.reserva.findUnique({
    where: { codigo },
    select: {
      id: true,
      codigo: true,
      checkIn: true,
      checkOut: true,
      adultos: true,
      ninos: true,
      total: true,
      abono: true,
      notas: true,
      expiraEn: true,
      linkPago: true,
      linkPagoExpiraEn: true,
      huespedNombre: true,
      huespedEmail: true,
      huespedTelefono: true,
      cabana: { select: { nombre: true, slug: true, propiedad: { select: { nombre: true, slug: true, email: true } } } },
    },
  });
  if (!r) return null;
  const checkIn = aFechaIso(r.checkIn);
  const checkOut = aFechaIso(r.checkOut);
  const prueba = r.notas?.startsWith(MARCA_PRUEBA) ?? false;
  const limite = r.linkPagoExpiraEn ?? r.expiraEn;
  const sitio = urlDelSitio();
  return {
    id: r.id,
    datos: {
      codigo: r.codigo,
      prueba,
      propiedad: r.cabana.propiedad.nombre,
      emailPropiedad: r.cabana.propiedad.email,
      cabana: r.cabana.nombre,
      huespedNombre: r.huespedNombre,
      huespedEmail: r.huespedEmail,
      huespedTelefono: r.huespedTelefono,
      // El comentario del formulario es la presentación del huésped (sin la marca de prueba).
      mensaje: r.notas?.replace(MARCA_PRUEBA, "").trim() || null,
      llegada: formatearFechaLarga(checkIn),
      salida: formatearFechaLarga(checkOut),
      noches: nochesEntre(checkIn, checkOut).length,
      personas: r.adultos + r.ninos,
      total: formatearCLP(r.total),
      abono: formatearCLP(r.abono),
      limite: limite ? formatearFechaHora(limite) : null,
      linkPago: r.linkPago,
      motivo,
      urlReserva: new URL(`/reserva/${r.codigo}`, sitio).toString(),
      urlReservar: new URL(`/reservar/${r.cabana.propiedad.slug}/${r.cabana.slug}`, sitio).toString(),
      urlPanel: new URL(`/admin/reservas/${r.codigo}`, sitio).toString(),
    },
  };
}

/** Guarda el aviso que falló (para mostrarlo en el panel) o borra la falla anterior del mismo aviso. */
async function registrarAviso(reservaId: string, clave: keyof typeof NOMBRE_AVISO, resultado: ResultadoAviso) {
  const nombre = NOMBRE_AVISO[clave];
  try {
    if (resultado.ok) {
      await db.reserva.updateMany({ where: { id: reservaId, avisoFallido: { startsWith: nombre } }, data: { avisoFallido: null } });
    } else {
      console.error("No se pudo enviar un aviso", nombre, reservaId, resultado.error);
      await db.reserva.update({
        where: { id: reservaId },
        data: { avisoFallido: `${nombre} (${formatearFechaHora(new Date())}): ${resultado.error}`.slice(0, 500) },
      });
    }
  } catch (e) {
    console.error("No se pudo registrar el resultado del aviso", nombre, reservaId, e);
  }
}

/** Avisa al huésped (por ahora solo por correo). Nunca lanza. */
export async function avisarHuesped(
  codigo: string,
  plantilla: PlantillaHuesped,
  motivo: string | null = null,
  urlResena: string | null = null, // invitación y recordatorio de reseña (lib/resenas.ts)
): Promise<ResultadoAviso> {
  try {
    const cargada = await cargarDatosAviso(codigo, motivo);
    if (!cargada) return { ok: false, error: "No existe la reserva" };
    const resultado = await notificarHuesped("email", plantilla, { ...cargada.datos, urlResena });
    await registrarAviso(cargada.id, plantilla, resultado);
    return resultado;
  } catch (e) {
    console.error("Error avisando al huésped", codigo, plantilla, e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Avisa al dueño (email de la propiedad). Nunca lanza. */
export async function avisarDueno(codigo: string, plantilla: PlantillaDueno): Promise<ResultadoAviso> {
  try {
    const cargada = await cargarDatosAviso(codigo);
    if (!cargada) return { ok: false, error: "No existe la reserva" };
    const resultado = await notificarDueno(plantilla, cargada.datos);
    await registrarAviso(cargada.id, `dueno_${plantilla}`, resultado);
    return resultado;
  } catch (e) {
    console.error("Error avisando al dueño", codigo, plantilla, e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Nueva solicitud: "recibimos tu solicitud" al huésped y aviso con el link al panel para el dueño. */
export async function avisarSolicitudNueva(codigo: string, { huesped = true }: { huesped?: boolean } = {}) {
  // huesped = false: la dirección superó el tope diario de correos (lib/limites.ts); el dueño igual se entera.
  await Promise.all([huesped ? avisarHuesped(codigo, "solicitud_recibida") : null, avisarDueno(codigo, "nueva_solicitud")]);
}

// ---------------------------------------------------------------------------------------------
// Cron (app/api/cron/expirar-reservas): expira, avisa y recuerda. Idempotente: cada aviso se
// "reserva" marcando su columna solo si estaba en null, así dos corridas no lo envían dos veces.
// ---------------------------------------------------------------------------------------------

export async function procesarSolicitudes(ahora = new Date()) {
  const expiradas = await expirarReservasVencidas(db, ahora);
  const marcar = async (id: string, campo: "expiracionAvisadaEn" | "recordatorioDuenoEn" | "recordatorioHuespedEn") =>
    (await db.reserva.updateMany({ where: { id, [campo]: null }, data: { [campo]: ahora } })).count === 1;

  let avisosExpiracion = 0;
  for (const r of await db.reserva.findMany({
    where: { estado: "expirada", expiracionAvisadaEn: null },
    select: { id: true, codigo: true, aprobadaEn: true },
  })) {
    if (!(await marcar(r.id, "expiracionAvisadaEn"))) continue;
    avisosExpiracion++;
    if (r.aprobadaEn) {
      await Promise.all([avisarHuesped(r.codigo, "pago_expirado"), avisarDueno(r.codigo, "pago_expirado")]);
    } else {
      await avisarHuesped(r.codigo, "solicitud_expirada");
    }
  }

  const ventana = new Date(ahora.getTime() + HORAS_RECORDATORIO * HORA_MS);
  let recordatoriosDueno = 0;
  for (const r of await db.reserva.findMany({
    where: { estado: "pendiente_aprobacion", recordatorioDuenoEn: null, expiraEn: { gt: ahora, lte: ventana } },
    select: { id: true, codigo: true, expiraEn: true, recordatorioDuenoEn: true },
  })) {
    if (!recordarAlDueno(r, ahora) || !(await marcar(r.id, "recordatorioDuenoEn"))) continue;
    recordatoriosDueno++;
    await avisarDueno(r.codigo, "recordatorio_solicitud");
  }

  let recordatoriosHuesped = 0;
  for (const r of await db.reserva.findMany({
    where: { estado: "aprobada_pendiente_pago", recordatorioHuespedEn: null, linkPagoExpiraEn: { gt: ahora, lte: ventana } },
    select: { id: true, codigo: true, aprobadaEn: true, linkPagoExpiraEn: true, recordatorioHuespedEn: true },
  })) {
    if (!recordarAlHuesped(r, ahora) || !(await marcar(r.id, "recordatorioHuespedEn"))) continue;
    recordatoriosHuesped++;
    await avisarHuesped(r.codigo, "recordatorio_pago");
  }

  return { expiradas, avisosExpiracion, recordatoriosDueno, recordatoriosHuesped };
}
