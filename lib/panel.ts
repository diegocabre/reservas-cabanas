// Cálculos del panel del dueño: funciones puras sobre reservas ya cargadas (filtradas por propiedad).
// Rangos [check_in, check_out): el día de salida no es una noche ocupada.

import type { EstadoReserva } from "@/lib/estados-reserva";
import { aFechaIso, nochesEntre, type Fecha } from "@/lib/precios";

export interface ReservaPanel {
  codigo: string;
  cabana: string;
  huesped: string;
  checkIn: Fecha;
  checkOut: Fecha;
  estado: EstadoReserva;
  total: number;
  /** Suma de pagos aprobados. */
  pagado: number;
  personas: number;
  /** Para escribirle al huésped por WhatsApp. */
  telefono?: string;
  notas?: string | null;
  /** Pago que no se pudo aplicar solo (columna revisar_pago) y sus motivos, una línea por pago. */
  revisarPago?: boolean;
  revisarPagoMotivo?: string | null;
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
 * Ocupación de un periodo de `dias` noches desde `desde` (inclusive): noches ocupadas por reservas
 * confirmadas / noches disponibles (cabañas activas × días). Porcentaje entero de 0 a 100.
 * Las estadías que empiezan antes o terminan después del periodo cuentan solo sus noches dentro.
 */
export function ocupacion(
  reservas: ReservaPanel[],
  desde: string,
  dias: number,
  cabanasActivas: number,
  bloqueos: BloqueoPanel[] = [],
) {
  const hasta = sumarDias(desde, dias);
  const dentro = (a: Fecha, b: Fecha) => nochesEntre(a, b).filter((d) => d >= desde && d < hasta).length;
  const ocupadas = reservas.filter(activa).reduce((n, r) => n + dentro(r.checkIn, r.checkOut), 0);
  const disponibles = dias * cabanasActivas;
  return {
    nochesOcupadas: ocupadas,
    /** Noches bloqueadas por el dueño (Airbnb, mantención…): no se pueden reservar aquí. */
    nochesBloqueadas: bloqueos.reduce((n, b) => n + dentro(b.desde, b.hasta), 0),
    nochesDisponibles: disponibles,
    porcentaje: disponibles ? Math.round((ocupadas / disponibles) * 100) : 0,
  };
}

/** Ocupación de un mes calendario ("2026-10"). */
export function ocupacionMes(reservas: ReservaPanel[], mes: string, cabanasActivas: number) {
  const inicio = `${mes.slice(0, 7)}-01`;
  const [anio, m] = inicio.split("-").map(Number);
  const fin = new Date(Date.UTC(anio, m, 1)).toISOString().slice(0, 10); // primer día del mes siguiente
  return ocupacion(reservas, inicio, nochesEntre(inicio, fin).length, cabanasActivas);
}

/**
 * Reservas con un pago que no se pudo aplicar solo (revisar_pago, ver lib/mercadopago.ts):
 * monto distinto al abono, o pago que llegó cuando las fechas ya estaban tomadas. Cualquier estado:
 * una reserva cancelada por vencer puede tener un pago aprobado que hay que devolver.
 */
export function porRevisarPago<T extends Pick<ReservaPanel, "revisarPago" | "checkIn" | "cabana">>(reservas: T[]): T[] {
  return reservas
    .filter((r) => r.revisarPago)
    .sort((a, b) => aFechaIso(a.checkIn).localeCompare(aFechaIso(b.checkIn)) || a.cabana.localeCompare(b.cabana));
}

/** Cuántas cabañas están reservadas y cuántas bloqueadas cada noche (para ver los días libres). */
export function ocupacionPorDia(
  reservas: ReservaPanel[],
  desde: string,
  dias: number,
  bloqueos: BloqueoPanel[] = [],
): { fecha: string; ocupadas: number; bloqueadas: number }[] {
  const contar = (rangos: { desde: Fecha; hasta: Fecha }[]) => {
    const conteo = new Map<string, number>();
    for (const r of rangos) for (const noche of nochesEntre(r.desde, r.hasta)) conteo.set(noche, (conteo.get(noche) ?? 0) + 1);
    return conteo;
  };
  const reservadas = contar(reservas.filter(activa).map((r) => ({ desde: r.checkIn, hasta: r.checkOut })));
  const bloqueadas = contar(bloqueos);
  return Array.from({ length: dias }, (_, i) => {
    const fecha = sumarDias(desde, i);
    return { fecha, ocupadas: reservadas.get(fecha) ?? 0, bloqueadas: bloqueadas.get(fecha) ?? 0 };
  });
}

/** Bloqueo de fechas tal como lo usa el panel ([desde, hasta), hasta exclusivo). */
export interface BloqueoPanel {
  id?: string;
  cabana: string;
  desde: Fecha;
  hasta: Fecha;
  motivo: string | null;
}

/** Bloqueos que tocan las noches de [desde, desde + dias), por fecha. */
export function bloqueosEnPeriodo<T extends BloqueoPanel>(bloqueos: T[], desde: string, dias: number): T[] {
  const hasta = sumarDias(desde, dias);
  return bloqueos
    .filter((b) => aFechaIso(b.desde) < hasta && aFechaIso(b.hasta) > desde)
    .sort((a, b) => aFechaIso(a.desde).localeCompare(aFechaIso(b.desde)) || a.cabana.localeCompare(b.cabana));
}
