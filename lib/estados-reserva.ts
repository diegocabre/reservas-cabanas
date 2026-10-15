// Reglas de las acciones del dueño sobre una reserva (funciones puras, sin base de datos).
// El servidor las vuelve a aplicar dentro de la transacción con el estado leído de la base:
// lo que muestra el navegador nunca decide.

import { MARCA_REVISAR } from "@/lib/pagos";

// Los estados de reserva viven en el enum de Prisma (estado_reserva); aquí, sus listas y nombres.
export type { EstadoReserva } from "@/lib/generated/prisma/enums";
import type { EstadoReserva } from "@/lib/generated/prisma/enums";

/**
 * Estados que retienen las fechas (los mismos de la restricción reserva_sin_traslape). Los que
 * tienen plazo (expira_en) dejan de ocupar al vencer, aunque el cron todavía no los haya pasado.
 */
export const ESTADOS_QUE_OCUPAN = ["pendiente_pago", "pendiente_aprobacion", "aprobada_pendiente_pago", "confirmada"] as const satisfies readonly EstadoReserva[];
export const ESTADOS_CON_PLAZO = ["pendiente_pago", "pendiente_aprobacion", "aprobada_pendiente_pago"] as const satisfies readonly EstadoReserva[];

export const tienePlazo = (estado: string) => (ESTADOS_CON_PLAZO as readonly string[]).includes(estado);
export type AccionEstado = "confirmar" | "cancelar";
export type MedioPagoSaldo = "efectivo" | "transferencia" | "mercadopago";

export const MEDIOS_PAGO_SALDO: readonly MedioPagoSaldo[] = ["efectivo", "transferencia", "mercadopago"];

export const NOMBRE_ESTADO: Record<EstadoReserva, string> = {
  pendiente_pago: "Pendiente de pago",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  pendiente_aprobacion: "Solicitud pendiente",
  aprobada_pendiente_pago: "Esperando pago",
  rechazada: "Rechazada",
  expirada: "Expirada",
};

export const NOMBRE_MEDIO: Record<MedioPagoSaldo | "flow", string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  flow: "Flow",
};

/**
 * Desde qué estados se puede hacer cada acción y a qué estado lleva.
 * - Confirmar: una pendiente (pagó por transferencia o el pago quedó en revisión) o una cancelada
 *   (el pago llegó después de vencer). Que las fechas sigan libres lo revisa la base al guardar.
 * - Cancelar: una pendiente o una confirmada. Libera las fechas (la restricción anti doble reserva
 *   solo considera pendiente_pago y confirmada).
 * - Aprobada por pagar: el dueño la confirma si le pagaron por otro medio, o la cancela.
 * Una completada ya ocurrió: no se confirma ni se cancela. Las solicitudes pendientes se aprueban o
 * rechazan (lib/aprobacion.ts), no se confirman directo.
 */
export const TRANSICIONES: Record<AccionEstado, { desde: readonly EstadoReserva[]; hacia: EstadoReserva }> = {
  confirmar: { desde: ["pendiente_pago", "cancelada", "aprobada_pendiente_pago", "expirada"], hacia: "confirmada" },
  cancelar: { desde: ["pendiente_pago", "confirmada", "aprobada_pendiente_pago"], hacia: "cancelada" },
};

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MOTIVO_TRANSICION: Record<AccionEstado, Partial<Record<EstadoReserva, string>>> = {
  confirmar: {
    confirmada: "La reserva ya está confirmada.",
    completada: "La reserva ya terminó: no se puede confirmar de nuevo.",
    pendiente_aprobacion: "Primero aprueba o rechaza la solicitud.",
    rechazada: "Rechazaste esta solicitud: no se puede confirmar.",
  },
  cancelar: {
    cancelada: "La reserva ya está cancelada.",
    completada: "La reserva ya terminó: no se puede cancelar.",
    pendiente_aprobacion: "Es una solicitud: recházala en vez de cancelarla.",
  },
};

/** ¿Se puede hacer esta acción desde este estado? Devuelve el estado nuevo o el motivo. */
export function validarTransicion(accion: AccionEstado, estado: EstadoReserva): Resultado<{ hacia: EstadoReserva }> {
  const regla = TRANSICIONES[accion];
  if (regla.desde.includes(estado)) return { ok: true, hacia: regla.hacia };
  return { ok: false, error: MOTIVO_TRANSICION[accion][estado] ?? "Esta acción no se puede hacer en el estado actual." };
}

/** Largo mínimo del motivo de cancelación (queda en la auditoría). */
export const MINIMO_MOTIVO = 5;

export function validarMotivo(motivo: string): Resultado<{ motivo: string }> {
  const limpio = motivo.trim();
  if (limpio.length < MINIMO_MOTIVO) return { ok: false, error: "Escribe el motivo de la cancelación." };
  if (limpio.length > 500) return { ok: false, error: "El motivo es muy largo (máximo 500 caracteres)." };
  return { ok: true, motivo: limpio };
}

/** Estados en que se puede registrar un pago: no en una cancelada. */
const ACEPTA_PAGOS: readonly EstadoReserva[] = ["pendiente_pago", "aprobada_pendiente_pago", "confirmada", "completada"];

/**
 * Valida un pago que registra el dueño (saldo en efectivo, transferencia, etc.).
 * Lo ya pagado (pagos aprobados: abono + saldos anteriores) más este monto no puede superar el total.
 */
export function validarPagoSaldo(p: {
  estado: EstadoReserva;
  total: number;
  pagado: number;
  monto: number;
  fecha: string;
  hoy: string;
}): Resultado {
  if (!ACEPTA_PAGOS.includes(p.estado)) return { ok: false, error: `No se pueden registrar pagos en una reserva ${NOMBRE_ESTADO[p.estado].toLowerCase()}.` };
  if (!Number.isInteger(p.monto) || p.monto <= 0) return { ok: false, error: "El monto debe ser un número entero mayor que cero." };
  const pendiente = p.total - p.pagado;
  if (pendiente <= 0) return { ok: false, error: "Esta reserva ya está pagada completa." };
  if (p.monto > pendiente) {
    return { ok: false, error: `El monto supera lo que falta por pagar: como máximo ${formatoPesos(pendiente)}.` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) return { ok: false, error: "Elige la fecha del pago." };
  if (p.fecha > p.hoy) return { ok: false, error: "La fecha del pago no puede ser futura." };
  return { ok: true };
}

const formatoPesos = (n: number) => `$${n.toLocaleString("es-CL")}`;

/** Las líneas [REVISAR PAGO] quedan como [PAGO REVISADO]: el aviso desaparece y la historia se conserva. */
export const MARCA_REVISADO = "[PAGO REVISADO]";

export function marcarPagoRevisado(notas: string | null): string | null {
  return notas?.replaceAll(MARCA_REVISAR, MARCA_REVISADO) ?? null;
}

export function tieneRevisarPago(notas: string | null | undefined): boolean {
  return Boolean(notas?.includes(MARCA_REVISAR));
}

/** Acciones que el panel ofrece para una reserva (el servidor igual las vuelve a validar). */
export function accionesDisponibles(r: { estado: EstadoReserva; total: number; pagado: number; notas: string | null }) {
  return {
    confirmar: validarTransicion("confirmar", r.estado).ok,
    cancelar: validarTransicion("cancelar", r.estado).ok,
    registrarPago: ACEPTA_PAGOS.includes(r.estado) && r.total - r.pagado > 0,
    marcarRevisado: tieneRevisarPago(r.notas),
  };
}
