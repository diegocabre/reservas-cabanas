-- Intentos en rutas públicas (reservar, buscar reserva, reseñas, mis datos, correos enviados), para
-- limitar abusos: lib/limites.ts. Solo una tabla nueva: no toca datos existentes.
-- La clave es un HMAC-SHA256 con sal (LIMITES_SECRETO) de la IP, el email o el teléfono: nunca en claro.
-- Solo la usa el servidor (postgres): RLS activado y sin grants para panel_admin ni la API pública.
-- Reversa: prisma/reversas/intentos_publicos.down.sql

CREATE TABLE "intentos_publicos" (
    "id" BIGSERIAL NOT NULL,
    "accion" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intentos_publicos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "intentos_publicos_accion_clave_creado_en_idx" ON "intentos_publicos"("accion", "clave", "creado_en");
CREATE INDEX "intentos_publicos_creado_en_idx" ON "intentos_publicos"("creado_en");

alter table "intentos_publicos" enable row level security;
