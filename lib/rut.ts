// RUT chileno: validación con dígito verificador (módulo 11) y formato.

/** Quita puntos, guion y espacios; deja el DV en mayúscula. "12.345.678-k" → "12345678K" */
export function limpiarRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Dígito verificador para el cuerpo del RUT (solo números). */
export function calcularDv(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/** true si el RUT tiene formato válido y su dígito verificador cuadra. */
export function validarRut(rut: string): boolean {
  const limpio = limpiarRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;
  return calcularDv(limpio.slice(0, -1)) === limpio.slice(-1);
}

/** Formato para guardar y mostrar: "12345678-5". Asume un RUT ya validado. */
export function normalizarRut(rut: string): string {
  const limpio = limpiarRut(rut);
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}
