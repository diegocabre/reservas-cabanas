/** Código SQLSTATE de Postgres dentro de un error de Prisma (con adaptador pg), si lo hay. */
export function codigoPostgres(e: unknown): string | undefined {
  const err = e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };
  return err?.meta?.driverAdapterError?.cause?.originalCode;
}

/** 23P01: violación de la restricción de exclusión (dos reservas activas que se traslapan). */
export const TRASLAPE_RESERVA = "23P01";
