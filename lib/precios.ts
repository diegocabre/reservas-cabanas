// Cálculo de precio de una estadía con tarifas fijas todo el año (tabla Tarifa).
//
// Reglas (ver CLAUDE.md):
// - Noches = check_out - check_in (check_out EXCLUSIVO). Personas = adultos + niños.
// - El precio por noche depende de las personas y del largo de la estadía: se usa la tarifa de la
//   cabaña cuyo tramo de personas incluye al grupo y con el mayor noches_desde que alcance. Ese
//   precio se cobra en TODAS las noches (4 personas, 3 noches = 3 × $60.000).
// - Si no hay tarifa para ese grupo, falla con error claro. Nunca cobra 0.
// - Estadía mínima y abono se leen por cabaña (min_noches; abono_noches o abono_pct de su propiedad).
// - Montos en CLP como enteros.
//
// Funciones puras: no tocan la base. Las usan igual el navegador (cotizar) y el servidor (cobrar).

/** Fecha sin hora: "YYYY-MM-DD" o Date a medianoche UTC (como Prisma entrega @db.Date). */
export type Fecha = string | Date;

export interface TarifaPrecio {
  personasDesde: number; // inclusivo
  personasHasta: number; // inclusivo
  nochesDesde: number; // rige desde esta cantidad de noches
  precioNoche: number;
}

export interface CabanaPrecio {
  nombre: string;
  /** Estadía mínima de la cabaña (cabana.min_noches). */
  minNoches: number;
  capacidad: number;
}

export interface Cotizacion {
  noches: number;
  personas: number;
  precioNoche: number;
  total: number;
  tarifa: TarifaPrecio;
}

export class ErrorPrecio extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RangoInvalidoError extends ErrorPrecio {}

export class MinimoNochesError extends ErrorPrecio {
  constructor(
    readonly minNoches: number,
    readonly noches: number,
  ) {
    super(`Estadía mínima: ${minNoches} ${minNoches === 1 ? "noche" : "noches"}.`);
  }
}

export class PersonasInvalidasError extends ErrorPrecio {}

export class SinTarifaError extends ErrorPrecio {
  constructor(
    readonly cabana: string,
    readonly personas: number,
    readonly noches: number,
  ) {
    super(`La cabaña "${cabana}" no tiene tarifa para ${personas} ${personas === 1 ? "persona" : "personas"} y ${noches} noches. No se puede calcular el precio.`);
  }
}

export class TarifasTraslapadasError extends ErrorPrecio {
  constructor(
    readonly cabana: string,
    readonly personas: number,
  ) {
    super(`La cabaña "${cabana}" tiene más de una tarifa para ${personas} personas con el mismo mínimo de noches. Corrige las tarifas.`);
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
  tarifas: TarifaPrecio[];
  checkIn: Fecha;
  checkOut: Fecha;
  personas: number;
}): Cotizacion {
  const { cabana, tarifas, personas } = params;
  const noches = nochesEntre(params.checkIn, params.checkOut).length;
  if (noches < cabana.minNoches) throw new MinimoNochesError(cabana.minNoches, noches);

  if (!Number.isInteger(personas) || personas < 1) {
    throw new PersonasInvalidasError("Debe venir al menos 1 persona.");
  }
  if (personas > cabana.capacidad) {
    throw new PersonasInvalidasError(`La cabaña es para un máximo de ${cabana.capacidad} personas.`);
  }

  const delGrupo = tarifas.filter((t) => t.personasDesde <= personas && personas <= t.personasHasta);
  const nochesDesde = Math.max(...delGrupo.filter((t) => t.nochesDesde <= noches).map((t) => t.nochesDesde));
  const aplican = delGrupo.filter((t) => t.nochesDesde === nochesDesde);
  if (aplican.length === 0) throw new SinTarifaError(cabana.nombre, personas, noches);
  if (aplican.length > 1) throw new TarifasTraslapadasError(cabana.nombre, personas);

  const [tarifa] = aplican;
  return { noches, personas, precioNoche: tarifa.precioNoche, total: noches * tarifa.precioNoche, tarifa };
}

/** Precio "desde" para la página pública: el menor precio por noche de la cabaña. null si no tiene tarifas. */
export function precioDesde(tarifas: Pick<TarifaPrecio, "precioNoche">[]): number | null {
  return tarifas.length ? Math.min(...tarifas.map((t) => t.precioNoche)) : null;
}

export interface Abono {
  abono: number;
  saldo: number;
}

/** Regla de abono de la propiedad: N noches de la tarifa (si abono_noches no es null) o % del total. */
export interface ReglaAbono {
  abonoPct: number;
  abonoNoches: number | null;
}

/**
 * Abono a pagar online y saldo que se paga en la cabaña.
 * - Con abono_noches: N noches al precio por noche de la estadía, con tope en el total
 *   (piloto: 1 noche; en una estadía de 1 noche se paga todo y el saldo es 0).
 * - Si no: porcentaje del total, redondeado al peso.
 * El saldo es lo que falta, así abono + saldo = total siempre.
 * Es la única fuente del cálculo: formulario, reserva, Mercado Pago, webhook, emails y panel.
 */
export function calcularAbono(total: number, precioNoche: number, regla: ReglaAbono): Abono {
  if (!Number.isInteger(total) || total < 0) {
    throw new ErrorPrecio(`Total inválido: ${total}. Debe ser un entero en CLP.`);
  }
  let abono: number;
  if (regla.abonoNoches !== null) {
    if (!Number.isInteger(regla.abonoNoches) || regla.abonoNoches < 1) {
      throw new ErrorPrecio(`Noches de abono inválidas: ${regla.abonoNoches}. Debe ser un entero desde 1.`);
    }
    if (!Number.isInteger(precioNoche) || precioNoche <= 0) {
      throw new ErrorPrecio(`Precio por noche inválido: ${precioNoche}. Debe ser un entero en CLP.`);
    }
    abono = Math.min(total, regla.abonoNoches * precioNoche);
  } else {
    if (!Number.isInteger(regla.abonoPct) || regla.abonoPct < 0 || regla.abonoPct > 100) {
      throw new ErrorPrecio(`Porcentaje de abono inválido: ${regla.abonoPct}. Debe ser un entero entre 0 y 100.`);
    }
    abono = Math.round((total * regla.abonoPct) / 100);
  }
  return { abono, saldo: total - abono };
}

/** Cómo se calcula el abono, para mostrarlo: "1 noche", "2 noches" o "50%". */
export function describirAbono(regla: ReglaAbono): string {
  if (regla.abonoNoches === null) return `${regla.abonoPct}%`;
  return `${regla.abonoNoches} ${regla.abonoNoches === 1 ? "noche" : "noches"}`;
}

/** Saldo de una reserva ya creada: total menos el abono que se le cobró al reservar. */
export function saldoReserva(r: { total: number; abono: number }): number {
  return r.total - r.abono;
}
