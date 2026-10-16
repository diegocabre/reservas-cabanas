import { randomInt } from "node:crypto";

/**
 * Caracteres de los códigos de reserva: sin 0/O, 1/I/L, para que no se confundan al
 * dictarlos por teléfono o leerlos en un email. 31 caracteres.
 */
export const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** Largo del sufijo de los códigos nuevos: 31^8 ≈ 8,5 billones (≈ 39,6 bits). */
export const LARGO_CODIGO = 8;
/** Largo de los códigos creados hasta octubre de 2026 (31^6 ≈ 29,7 bits): siguen siendo válidos. */
export const LARGO_CODIGO_ANTERIOR = 6;

/**
 * Código de reserva aleatorio (generador criptográfico): prefijo de la propiedad + 8 caracteres,
 * ej. "LL-7K3QX9AB". Con ~40 bits y el límite de intentos por IP (lib/limites.ts) no se puede
 * adivinar probando. La unicidad la garantiza el índice único de la base (si choca, se genera otro).
 */
export function generarCodigoReserva(prefijo: string, azar: (max: number) => number = randomInt): string {
  let sufijo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) sufijo += ALFABETO_CODIGO[azar(ALFABETO_CODIGO.length)];
  return `${prefijo}-${sufijo}`;
}

/**
 * Formas posibles de lo que escribe el huésped ("ll 7k3qx9ab" → "LL-7K3QX9AB"), de la más probable a
 * la menos. Sin guion no se sabe dónde termina el prefijo: se prueba con el largo nuevo y el anterior.
 */
export function candidatosCodigo(valor: string): string[] {
  const texto = valor.trim().toUpperCase();
  // Ya viene como código (por ejemplo, desde un link): se usa tal cual.
  if (/^[A-Z]+-[A-Z0-9]+$/.test(texto)) return [texto];
  const limpio = texto.replace(/[^A-Z0-9]/g, "");
  // Códigos antiguos: correlativo de 4 dígitos (LL-0001).
  const antiguo = limpio.match(/^([A-Z]+)(\d{4})$/);
  if (antiguo) return [`${antiguo[1]}-${antiguo[2]}`];
  const formas = [LARGO_CODIGO, LARGO_CODIGO_ANTERIOR]
    .filter((n) => limpio.length > n)
    .map((n) => `${limpio.slice(0, -n)}-${limpio.slice(-n)}`);
  return formas.length ? formas : [limpio];
}

/** La forma más probable de un código escrito a mano (ver candidatosCodigo). */
export function normalizarCodigo(valor: string): string {
  return candidatosCodigo(valor)[0];
}
