// Logs estructurados: una línea JSON por evento, buscable en los logs de Vercel por "evento".
// Nunca llevan tokens ni datos personales: solo ids, códigos de reserva y mensajes de error saneados.

type Nivel = "info" | "warn" | "error";

/** Quita emails, teléfonos y tokens de un texto (los errores de Prisma o de un SDK pueden traerlos). */
export function sanear(texto: string): string {
  return texto
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, "[email]")
    .replace(/\b(APP_USR|TEST)-[\w-]+/g, "[token]")
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [token]")
    .replace(/\+?\d[\d\s]{7,}\d/g, "[número]")
    .slice(0, 300);
}

/** Mensaje de un error, saneado. */
export function detalleError(e: unknown): string {
  if (e instanceof Error) return sanear(e.message);
  if (typeof e === "object" && e && "message" in e) return sanear(String((e as { message: unknown }).message));
  return sanear(String(e));
}

/** Escribe el evento. Los valores Error se reducen a su mensaje saneado. */
export function registrar(nivel: Nivel, evento: string, datos: Record<string, unknown> = {}): void {
  console[nivel](JSON.stringify({ evento, ...datos }, (_clave, valor) => (valor instanceof Error ? detalleError(valor) : valor)));
}
