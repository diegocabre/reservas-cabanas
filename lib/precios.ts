// Cálculo de precio de una estadía, noche por noche, según temporada.
//
// Reglas (ver CLAUDE.md):
// - Rangos semiabiertos [desde, hasta): check_out y temporada.hasta son EXCLUSIVOS.
// - Noches = check_out - check_in. Cada noche se cobra con la temporada que la cubre.
// - Si una noche no tiene temporada, falla con error claro. Nunca cobra 0.
// - Montos en CLP como enteros.
//
// Funciones puras: no tocan la base. Reciben las temporadas ya cargadas.

/** Fecha sin hora: "YYYY-MM-DD" o Date a medianoche UTC (como Prisma entrega @db.Date). */
export type Fecha = string | Date;

export interface TemporadaPrecio {
  nombre: string;
  desde: Fecha; // inclusivo
  hasta: Fecha; // EXCLUSIVO
  precioNoche: number;
  minNoches: number | null; // null = rige el mínimo de la cabaña
}

export interface CabanaPrecio {
  nombre: string;
  minNoches: number;
}

export interface NocheCotizada {
  fecha: string; // noche del día "YYYY-MM-DD"
  temporada: string;
  precio: number;
}

export interface Cotizacion {
  noches: number;
  detalle: NocheCotizada[];
  total: number;
  /** Mínimo de noches exigido: el mayor entre las temporadas que toca la estadía. */
  minNoches: number;
}

export class ErrorPrecio extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RangoInvalidoError extends ErrorPrecio {}

export class NocheSinTemporadaError extends ErrorPrecio {
  constructor(
    readonly cabana: string,
    readonly fecha: string,
  ) {
    super(`La cabaña "${cabana}" no tiene temporada configurada para la noche del ${fecha}. No se puede calcular el precio.`);
  }
}

export class TemporadasTraslapadasError extends ErrorPrecio {
  constructor(
    readonly cabana: string,
    readonly fecha: string,
    readonly temporadas: string[],
  ) {
    super(
      `La cabaña "${cabana}" tiene más de una temporada para la noche del ${fecha} (${temporadas.join(", ")}). Corrige las temporadas.`,
    );
  }
}

export class MinimoNochesError extends ErrorPrecio {
  constructor(
    readonly minNoches: number,
    readonly noches: number,
  ) {
    super(`La estadía mínima para estas fechas es de ${minNoches} noches (elegiste ${noches}).`);
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

/** Normaliza a "YYYY-MM-DD" y valida que sea una fecha real sin hora. */
export function aFechaIso(f: Fecha): string {
  if (f instanceof Date) {
    if (Number.isNaN(f.getTime()) || f.getTime() % DIA_MS !== 0) {
      throw new RangoInvalidoError(`Fecha inválida o con hora: ${String(f)}. Usa medianoche UTC.`);
    }
    return f.toISOString().slice(0, 10);
  }
  if (!ISO.test(f) || new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) !== f) {
    throw new RangoInvalidoError(`Fecha inválida: "${f}". Usa el formato YYYY-MM-DD.`);
  }
  return f;
}

function sumarDia(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10);
}

/** Noches entre check-in y check-out, como "YYYY-MM-DD". Falla si check_out <= check_in. */
export function nochesEntre(checkIn: Fecha, checkOut: Fecha): string[] {
  const inicio = aFechaIso(checkIn);
  const fin = aFechaIso(checkOut);
  if (fin <= inicio) {
    throw new RangoInvalidoError(`El check-out (${fin}) debe ser posterior al check-in (${inicio}).`);
  }
  const noches: string[] = [];
  for (let n = inicio; n < fin; n = sumarDia(n)) noches.push(n);
  return noches;
}

export function calcularPrecio(params: {
  cabana: CabanaPrecio;
  temporadas: TemporadaPrecio[];
  checkIn: Fecha;
  checkOut: Fecha;
}): Cotizacion {
  const { cabana, checkIn, checkOut } = params;
  const temporadas = params.temporadas.map((t) => ({ ...t, desde: aFechaIso(t.desde), hasta: aFechaIso(t.hasta) }));

  let minNoches = cabana.minNoches;
  const detalle = nochesEntre(checkIn, checkOut).map((fecha): NocheCotizada => {
    const cubren = temporadas.filter((t) => t.desde <= fecha && fecha < t.hasta);
    if (cubren.length === 0) throw new NocheSinTemporadaError(cabana.nombre, fecha);
    if (cubren.length > 1) {
      throw new TemporadasTraslapadasError(cabana.nombre, fecha, cubren.map((t) => t.nombre));
    }
    const [t] = cubren;
    minNoches = Math.max(minNoches, t.minNoches ?? cabana.minNoches);
    return { fecha, temporada: t.nombre, precio: t.precioNoche };
  });

  if (detalle.length < minNoches) throw new MinimoNochesError(minNoches, detalle.length);

  return {
    noches: detalle.length,
    detalle,
    total: detalle.reduce((suma, n) => suma + n.precio, 0),
    minNoches,
  };
}

/** Abono a pagar online: porcentaje del total, redondeado al peso. */
export function calcularAbono(total: number, abonoPct: number): number {
  if (!Number.isInteger(total) || total < 0) {
    throw new ErrorPrecio(`Total inválido: ${total}. Debe ser un entero en CLP.`);
  }
  if (!Number.isInteger(abonoPct) || abonoPct < 0 || abonoPct > 100) {
    throw new ErrorPrecio(`Porcentaje de abono inválido: ${abonoPct}. Debe ser un entero entre 0 y 100.`);
  }
  return Math.round((total * abonoPct) / 100);
}
