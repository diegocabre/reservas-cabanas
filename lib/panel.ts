// Cálculos del panel del dueño: funciones puras sobre reservas ya cargadas (filtradas por propiedad).
// Rangos [check_in, check_out): el día de salida no es una noche ocupada.

import { aFechaIso, nochesEntre, type Fecha } from "@/lib/precios";

export interface ReservaPanel {
  codigo: string;
  cabana: string;
  huesped: string;
  checkIn: Fecha;
  checkOut: Fecha;
  estado: "pendiente_pago" | "confirmada" | "cancelada" | "completada";
  total: number;
  /** Suma de pagos aprobados. */
  pagado: number;
  personas: number;
}

const DIA_MS = 86_400_000;
const sumarDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** Reservas que cuentan como estadías reales (pagadas o ya realizadas). */
const activa = (r: ReservaPanel) => r.estado === "confirmada" || r.estado === "completada";

const porFecha = (campo: "checkIn" | "checkOut") => (a: ReservaPanel, b: ReservaPanel) =>
  aFechaIso(a[campo]).localeCompare(aFechaIso(b[campo])) || a.cabana.localeCompare(b.cabana);

export function llegadas(reservas: ReservaPanel[], desde: string, dias = 1): ReservaPanel[] {
  const hasta = sumarDias(desde, dias);
  return reservas
    .filter((r) => activa(r) && aFechaIso(r.checkIn) >= desde && aFechaIso(r.checkIn) < hasta)
    .sort(porFecha("checkIn"));
}

export function salidas(reservas: ReservaPanel[], desde: string, dias = 1): ReservaPanel[] {
  const hasta = sumarDias(desde, dias);
  return reservas
    .filter((r) => activa(r) && aFechaIso(r.checkOut) >= desde && aFechaIso(r.checkOut) < hasta)
    .sort(porFecha("checkOut"));
}

/** Huéspedes que pasan la noche de hoy en la cabaña. */
export function enCasa(reservas: ReservaPanel[], hoy: string): ReservaPanel[] {
  return reservas.filter((r) => activa(r) && aFechaIso(r.checkIn) <= hoy && hoy < aFechaIso(r.checkOut)).sort(porFecha("checkOut"));
}

/** Saldo que falta cobrar en cada reserva confirmada, de la llegada más próxima a la más lejana. */
export function saldosPorCobrar(reservas: ReservaPanel[]): (ReservaPanel & { saldo: number })[] {
  return reservas
    .filter(activa)
    .map((r) => ({ ...r, saldo: Math.max(0, r.total - r.pagado) }))
    .filter((r) => r.saldo > 0)
    .sort(porFecha("checkIn"));
}

/**
 * Ocupación de un mes: noches ocupadas por reservas confirmadas / noches disponibles
 * (cabañas activas × días del mes). Entero de 0 a 100.
 */
export function ocupacionMes(reservas: ReservaPanel[], mes: string, cabanasActivas: number) {
  const inicio = `${mes.slice(0, 7)}-01`;
  const [anio, m] = inicio.split("-").map(Number);
  const fin = new Date(Date.UTC(anio, m, 1)).toISOString().slice(0, 10); // primer día del mes siguiente
  const dias = nochesEntre(inicio, fin).length;

  const ocupadas = reservas
    .filter(activa)
    .reduce((n, r) => n + nochesEntre(r.checkIn, r.checkOut).filter((d) => d >= inicio && d < fin).length, 0);
  const disponibles = dias * cabanasActivas;
  return {
    nochesOcupadas: ocupadas,
    nochesDisponibles: disponibles,
    porcentaje: disponibles ? Math.round((ocupadas / disponibles) * 100) : 0,
  };
}
