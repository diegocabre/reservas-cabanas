/** Código SQLSTATE de Postgres dentro de un error de Prisma (con adaptador pg), si lo hay. */
export function codigoPostgres(e: unknown): string | undefined {
  const err = e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };
  return err?.meta?.driverAdapterError?.cause?.originalCode;
}

/** 23P01: violación de la restricción de exclusión (dos reservas activas que se traslapan). */
export const TRASLAPE_RESERVA = "23P01";

/** Cliente con $queryRaw (el de Prisma o una transacción). */
type ConConsultas = { $queryRaw: <T = unknown>(consulta: TemplateStringsArray, ...valores: unknown[]) => Promise<T> };

/**
 * Cerrojo por cabaña hasta el final de la transacción (pg_advisory_xact_lock). Lo toman todos los que
 * revisan disponibilidad y luego escriben: reserva web, confirmación del dueño y bloqueos. Así un
 * bloqueo y una reserva simultáneos no pueden pasar los dos. No necesita permisos sobre ninguna tabla.
 */
export async function cerrojoCabana(tx: ConConsultas, cabanaId: string): Promise<void> {
  await tx.$queryRaw`select 1 as ok from (select pg_advisory_xact_lock(hashtextextended(${cabanaId}::text, 0))) as cerrojo`;
}
