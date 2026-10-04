// Disponibilidad de una cabaña, noche por noche.
//
// Reglas (ver CLAUDE.md):
// - Rangos semiabiertos [desde, hasta): el día de salida queda libre para otra llegada.
// - Ocupan noches: reservas `confirmada`, reservas `pendiente_pago` no vencidas y bloqueos.
//
// Funciones puras: reciben los rangos ya cargados y devuelven fechas "YYYY-MM-DD".

import { aFechaIso, nochesEntre, RangoInvalidoError, type Fecha } from "@/lib/precios";

export interface RangoOcupado {
  desde: Fecha; // inclusivo
  hasta: Fecha; // EXCLUSIVO
}

/** Minutos que tiene el huésped para pagar el abono antes de que se liberen las fechas. */
export const MINUTOS_PARA_PAGAR = 30;

/** Una reserva ocupa fechas si está confirmada, o pendiente de pago y aún no vence. */
export function reservaOcupa(r: { estado: string; expiraEn: Date | null }, ahora: Date): boolean {
  if (r.estado === "confirmada") return true;
  if (r.estado === "pendiente_pago") return r.expiraEn === null || r.expiraEn > ahora;
  return false;
}

/** Conjunto de noches ocupadas ("YYYY-MM-DD") a partir de reservas y bloqueos. */
export function nochesOcupadas(rangos: RangoOcupado[]): Set<string> {
  const ocupadas = new Set<string>();
  for (const r of rangos) {
    for (const noche of nochesEntre(r.desde, r.hasta)) ocupadas.add(noche);
  }
  return ocupadas;
}

export type ResultadoEstadia = { disponible: true } | { disponible: false; primeraNocheOcupada: string };

/** ¿Están libres todas las noches entre check-in y check-out? */
export function validarEstadia(checkIn: Fecha, checkOut: Fecha, ocupadas: Set<string>): ResultadoEstadia {
  const ocupada = nochesEntre(checkIn, checkOut).find((n) => ocupadas.has(n));
  return ocupada ? { disponible: false, primeraNocheOcupada: ocupada } : { disponible: true };
}

/**
 * Último día que se puede elegir como salida para una llegada dada:
 * la primera noche ocupada después del check-in (ese día se puede salir, porque
 * otro huésped llega). null si no hay ninguna noche ocupada en adelante.
 */
export function limiteSalida(checkIn: Fecha, ocupadas: Set<string>): string | null {
  const inicio = aFechaIso(checkIn);
  if (ocupadas.has(inicio)) {
    throw new RangoInvalidoError(`La noche del ${inicio} está ocupada: no se puede llegar ese día.`);
  }
  const posteriores = [...ocupadas].filter((n) => n > inicio).sort();
  return posteriores[0] ?? null;
}
