-- Plataforma: suspensión de propiedades (por falta de pago) y reseñas activas por propiedad.
-- Solo agrega columnas con default: todas las propiedades quedan activas (suspendida = false) y con
-- las reseñas apagadas, igual que hoy. panel_admin ya lee "propiedad" y NO puede actualizarla:
-- solo el servidor la cambia, después de verificar al superadmin (lib/plataforma.ts).
-- Reversa: prisma/reversas/plataforma_propiedad.down.sql

CREATE TYPE "etapa_resenas" AS ENUM ('apagadas', 'cabana', 'completas');

ALTER TABLE "propiedad"
  ADD COLUMN "resenas" "etapa_resenas" NOT NULL DEFAULT 'apagadas',
  ADD COLUMN "suspendida" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suspendida_en" TIMESTAMPTZ(3),
  ADD COLUMN "suspendida_por" TEXT;
