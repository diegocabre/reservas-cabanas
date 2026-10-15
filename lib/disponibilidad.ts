// Disponibilidad de una cabaña, noche por noche.
//
// Reglas (ver CLAUDE.md):
// - Rangos semiabiertos [desde, hasta): el día de salida queda libre para otra llegada.
// - Ocupan noches: reservas `confirmada`, las que tienen plazo (`pendiente_pago`, solicitudes
//   `pendiente_aprobacion` y `aprobada_pendiente_pago`) mientras no venzan, y bloqueos.
//
// Funciones puras: reciben los rangos ya cargados y devuelven fechas "YYYY-MM-DD".

import { tienePlazo } from "@/lib/estados-reserva";
import { aFechaIso, nochesEntre, RangoInvalidoError, type Fecha } from "@/lib/precios";

export interface RangoOcupado {
  desde: Fecha; // inclusivo
  hasta: Fecha; // EXCLUSIVO
}

/** Minutos que tiene el huésped para pagar el abono antes de que se liberen las fechas. */
export const MINUTOS_PARA_PAGAR = 30;

/** Una reserva ocupa fechas si está confirmada, o en un estado con plazo que aún no vence. */
export function reservaOcupa(r: { estado: string; expiraEn: Date | null }, ahora: Date): boolean {
  if (r.estado === "confirmada") return true;
  if (tienePlazo(r.estado)) return r.expiraEn === null || r.expiraEn > ahora;
  return false;
}

/** ¿Venció el plazo (de pago o de respuesta del dueño) de una reserva que aún no se marca? */
export const plazoVencido = (r: { estado: string; expiraEn: Date | null }, ahora: Date) =>
  tienePlazo(r.estado) && !reservaOcupa(r, ahora);

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

const sumarDias = (iso: string, n: number) =>
  new Date(Date.parse(`${aFechaIso(iso)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Primer día que se puede elegir como salida: llegada + estadía mínima de la cabaña. */
export function primeraSalida(checkIn: Fecha, minNoches: number): string {
  return sumarDias(aFechaIso(checkIn), minNoches);
}

/** ¿Esta salida deja una estadía más corta que el mínimo? (para avisar "Estadía mínima: N noches"). */
export function salidaMuyCorta(checkIn: Fecha, checkOut: Fecha, minNoches: number): boolean {
  return aFechaIso(checkOut) > aFechaIso(checkIn) && aFechaIso(checkOut) < primeraSalida(checkIn, minNoches);
}

/**
 * ¿Se puede llegar este día? Las primeras `minNoches` noches tienen que estar libres y la salida
 * mínima no puede pasar del último día reservable.
 */
export function llegadaPosible(dia: Fecha, minNoches: number, ocupadas: Set<string>, ultimoDia: string): boolean {
  const inicio = aFechaIso(dia);
  if (primeraSalida(inicio, minNoches) > ultimoDia) return false;
  return Array.from({ length: minNoches }, (_, i) => sumarDias(inicio, i)).every((n) => !ocupadas.has(n));
}
