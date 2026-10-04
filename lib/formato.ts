// Formatos para la interfaz en español de Chile.

export const ZONA_HORARIA = "America/Santiago";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** 120000 → "$120.000" */
export function formatearCLP(monto: number): string {
  if (!Number.isInteger(monto)) {
    throw new Error(`Monto inválido: ${monto}. Los montos en CLP son enteros.`);
  }
  // Intl puede devolver espacios no separables según el runtime; el formato del proyecto es "$120.000".
  return clp.format(monto).replace(/\s/g, "");
}

/** Fecha de hoy en Chile como "YYYY-MM-DD" (para comparar con columnas `date`). */
export function hoyEnChile(ahora: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** "2027-01-10" → "dom 10 ene" (para resúmenes compactos en el celular). */
export function formatearFechaCorta(iso: string): string {
  const fecha = new Date(`${iso}T00:00:00Z`);
  const partes = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .formatToParts(fecha)
    .filter((p) => p.type !== "literal")
    .map((p) => p.value.replace(".", ""));
  return partes.join(" ");
}

/** Hora en Chile: 2026-10-04T18:05:00Z → "15:05" */
export function formatearHora(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fecha);
}

/** "2027-01-10" → "10 de enero de 2027" */
export function formatearFechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}
