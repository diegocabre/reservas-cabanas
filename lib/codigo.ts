import { randomInt } from "node:crypto";

/**
 * Caracteres de los códigos de reserva: sin 0/O, 1/I/L, para que no se confundan al
 * dictarlos por teléfono o leerlos en un email. 31 caracteres.
 */
export const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LARGO_CODIGO = 6;

/**
 * Código de reserva aleatorio: prefijo de la propiedad + 6 caracteres, ej. "LL-7K3QX9".
 * 31^6 ≈ 887 millones de combinaciones: no se puede adivinar probando. La unicidad la
 * garantiza el índice único de la base (si choca, se genera otro).
 */
export function generarCodigoReserva(prefijo: string, azar: (max: number) => number = randomInt): string {
  let sufijo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) sufijo += ALFABETO_CODIGO[azar(ALFABETO_CODIGO.length)];
  return `${prefijo}-${sufijo}`;
}

/** Normaliza lo que escribe el huésped: "ll 7k3qx9" → "LL-7K3QX9". */
export function normalizarCodigo(valor: string): string {
  const limpio = valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Códigos antiguos: correlativo de 4 dígitos (LL-0001).
  const antiguo = limpio.match(/^([A-Z]+)(\d{4})$/);
  if (antiguo) return `${antiguo[1]}-${antiguo[2]}`;
  // Códigos actuales: el sufijo siempre tiene LARGO_CODIGO caracteres.
  if (limpio.length > LARGO_CODIGO) return `${limpio.slice(0, -LARGO_CODIGO)}-${limpio.slice(-LARGO_CODIGO)}`;
  return limpio;
}
