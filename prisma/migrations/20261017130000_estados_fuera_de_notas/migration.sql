-- Saca los estados del campo de texto `notas`: "[PRUEBA]" y "[REVISAR PAGO]" pasan a columnas.
-- Solo agrega columnas con default: NO toca `notas` ni ninguna fila existente. Qué reservas antiguas
-- marcar se decide a mano con scripts/marcas-en-notas.ts (por defecto solo lista, sin escribir).
-- "reserva" ya tiene RLS y panel_admin tiene permisos sobre la tabla completa: no hace falta nada más.
-- Reversa: prisma/reversas/estados_fuera_de_notas.down.sql

ALTER TABLE "reserva"
  ADD COLUMN "es_prueba" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revisar_pago" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revisar_pago_motivo" TEXT;
