// Reglas puras de las solicitudes de reserva (cabañas con aprobación manual). Sin base de datos:
// lib/aprobacion.ts las aplica con lo que lee de la base.

import { formatearFechaHora } from "@/lib/formato";
import { enlaceWhatsapp, mensajeAprobacion } from "@/lib/whatsapp";

/** Horas antes del vencimiento en que se recuerda al dueño (responder) y al huésped (pagar). */
export const HORAS_RECORDATORIO = 6;
const HORA_MS = 3_600_000;

/** Plazos que el dueño puede elegir por cabaña (horas). La base tiene el mismo rango (check). */
export const HORAS_MINIMAS = 1;
export const HORAS_MAXIMAS = 168;

export type BotonWhatsapp =
  | { habilitado: true; url: string }
  | { habilitado: false; motivo: string; puedeRenovar: boolean };

/**
 * Botón "Enviar por WhatsApp" de una solicitud aprobada. Sin teléfono o con el link vencido queda
 * deshabilitado con el motivo; si venció, el dueño puede generar un link nuevo.
 */
export function botonWhatsappAprobacion(r: {
  huespedNombre: string;
  huespedTelefono: string | null;
  cabana: string;
  checkIn: string;
  checkOut: string;
  linkPago: string | null;
  linkPagoExpiraEn: Date | null;
  ahora: Date;
}): BotonWhatsapp {
  if (!r.linkPago || !r.linkPagoExpiraEn) return { habilitado: false, motivo: "Todavía no hay link de pago.", puedeRenovar: true };
  if (r.linkPagoExpiraEn <= r.ahora) return { habilitado: false, motivo: "El link de pago venció.", puedeRenovar: true };
  const url = r.huespedTelefono
    ? enlaceWhatsapp(
        r.huespedTelefono,
        mensajeAprobacion({
          nombre: r.huespedNombre,
          cabana: r.cabana,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          linkPago: r.linkPago,
          limite: formatearFechaHora(r.linkPagoExpiraEn),
        }),
      )
    : null;
  if (!url) return { habilitado: false, motivo: "El huésped no dejó un teléfono válido.", puedeRenovar: false };
  return { habilitado: true, url };
}

/** ¿Toca recordarle al dueño una solicitud sin responder? Una vez, dentro de las últimas horas del plazo. */
export function recordarAlDueno(r: { expiraEn: Date | null; recordatorioDuenoEn: Date | null }, ahora: Date): boolean {
  if (!r.expiraEn || r.recordatorioDuenoEn || r.expiraEn <= ahora) return false;
  return r.expiraEn.getTime() - ahora.getTime() <= HORAS_RECORDATORIO * HORA_MS;
}

/**
 * ¿Toca recordarle al huésped que pague? Una vez, en las últimas horas del link. Si el link duraba
 * menos que eso (plazo corto), no: el correo de aprobación acaba de llegar.
 */
export function recordarAlHuesped(
  r: { aprobadaEn: Date | null; linkPagoExpiraEn: Date | null; recordatorioHuespedEn: Date | null },
  ahora: Date,
): boolean {
  if (!r.aprobadaEn || !r.linkPagoExpiraEn || r.recordatorioHuespedEn || r.linkPagoExpiraEn <= ahora) return false;
  const desde = r.linkPagoExpiraEn.getTime() - HORAS_RECORDATORIO * HORA_MS;
  return r.aprobadaEn.getTime() < desde && ahora.getTime() >= desde;
}

/** Motivo de rechazo opcional: limpio y acotado (se le muestra al huésped). */
export function limpiarMotivoRechazo(motivo: string | null | undefined): string | null {
  const limpio = (motivo ?? "").trim().slice(0, 500);
  return limpio || null;
}
