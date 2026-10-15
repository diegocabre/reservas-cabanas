-- Aprobación manual de reservas: estados y acciones de auditoría nuevos.
-- Va sola porque Postgres no deja usar un valor de enum recién agregado en la misma transacción
-- (la migración siguiente los usa en la restricción anti doble reserva).
-- Reversa: prisma/reversas/aprobacion_reservas.down.sql
ALTER TYPE "estado_reserva" ADD VALUE IF NOT EXISTS 'pendiente_aprobacion';
ALTER TYPE "estado_reserva" ADD VALUE IF NOT EXISTS 'aprobada_pendiente_pago';
ALTER TYPE "estado_reserva" ADD VALUE IF NOT EXISTS 'rechazada';
ALTER TYPE "estado_reserva" ADD VALUE IF NOT EXISTS 'expirada';

ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS 'aprobar';
ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS 'rechazar';
ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS 'nuevo_link_pago';
ALTER TYPE "accion_auditoria" ADD VALUE IF NOT EXISTS 'configurar_cabana';
