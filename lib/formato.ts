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

/** "2027-01-10" → "10 de enero de 2027" */
export function formatearFechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}
