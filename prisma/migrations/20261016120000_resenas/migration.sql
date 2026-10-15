-- Reseñas: de la cabaña (públicas, escritas por huéspedes) y del huésped (privadas, escritas por
-- dueños), con doble ciego. Solo agrega tablas y una columna opcional (reserva.huesped_id, en null):
-- no cambia ni borra datos existentes. Reversa: prisma/reversas/resenas.down.sql
-- Poblado de huesped (aparte, reversible): scripts/poblar-huespedes.ts
-- CreateEnum
CREATE TYPE "estado_resena" AS ENUM ('retenida', 'publicada', 'oculta');

-- CreateEnum
CREATE TYPE "calificacion_huesped" AS ENUM ('recomendado', 'con_reservas', 'no_recomendado');

-- CreateEnum
CREATE TYPE "motivo_reporte" AS ENUM ('insultos', 'datos_personales', 'no_corresponde');

-- CreateEnum
CREATE TYPE "estado_moderacion" AS ENUM ('pendiente', 'aceptado', 'descartado');

-- CreateEnum
CREATE TYPE "tipo_solicitud_privacidad" AS ENUM ('rectificacion', 'eliminacion');

-- AlterTable
ALTER TABLE "reserva" ADD COLUMN     "huesped_id" UUID;

-- CreateTable
CREATE TABLE "huesped" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "nombre_pila" TEXT NOT NULL,
    "acceso_version" INTEGER NOT NULL DEFAULT 0,
    "acceso_hash" TEXT,
    "acceso_expira_en" TIMESTAMPTZ(3),
    "acceso_pedido_en" TIMESTAMPTZ(3),
    "creado_por_poblado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "huesped_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclo_resena" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "token_hash" TEXT NOT NULL,
    "token_expira_en" TIMESTAMPTZ(3) NOT NULL,
    "invitacion_enviada_en" TIMESTAMPTZ(3),
    "recordatorio_en" TIMESTAMPTZ(3),
    "whatsapp_abierto_en" TIMESTAMPTZ(3),
    "recordatorio_dueno_en" TIMESTAMPTZ(3),
    "desbloqueado_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciclo_resena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resena_cabana" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "cabana_id" UUID NOT NULL,
    "nombre_publico" TEXT NOT NULL,
    "limpieza" INTEGER NOT NULL,
    "ubicacion" INTEGER NOT NULL,
    "comunicacion" INTEGER NOT NULL,
    "veracidad" INTEGER NOT NULL,
    "calidad_precio" INTEGER NOT NULL,
    "comentario" TEXT NOT NULL,
    "estado" "estado_resena" NOT NULL DEFAULT 'retenida',
    "ediciones" INTEGER NOT NULL DEFAULT 0,
    "publicada_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resena_cabana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuesta_resena" (
    "id" UUID NOT NULL,
    "resena_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "autor_usuario_id" UUID NOT NULL,
    "autor_email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "respuesta_resena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporte_resena" (
    "id" UUID NOT NULL,
    "resena_id" UUID NOT NULL,
    "motivo" "motivo_reporte" NOT NULL,
    "detalle" TEXT,
    "estado" "estado_moderacion" NOT NULL DEFAULT 'pendiente',
    "usuario_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "resuelto_por" TEXT,
    "resuelto_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporte_resena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resena_huesped" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "propiedad_id" UUID NOT NULL,
    "huesped_id" UUID NOT NULL,
    "autor_usuario_id" UUID NOT NULL,
    "autor_email" TEXT NOT NULL,
    "calificacion" "calificacion_huesped" NOT NULL,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comentario" TEXT,
    "estado" "estado_resena" NOT NULL DEFAULT 'retenida',
    "publicada_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resena_huesped_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replica_huesped" (
    "id" UUID NOT NULL,
    "resena_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "replica_huesped_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_privacidad" (
    "id" UUID NOT NULL,
    "huesped_id" UUID NOT NULL,
    "tipo" "tipo_solicitud_privacidad" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "estado" "estado_moderacion" NOT NULL DEFAULT 'pendiente',
    "resuelto_por" TEXT,
    "resuelto_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_privacidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_plataforma" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "compartir_reputacion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "configuracion_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "superadmin" (
    "usuario_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "superadmin_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "huesped_email_key" ON "huesped"("email");

-- CreateIndex
CREATE UNIQUE INDEX "huesped_acceso_hash_key" ON "huesped"("acceso_hash");

-- CreateIndex
CREATE INDEX "huesped_telefono_idx" ON "huesped"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "ciclo_resena_reserva_id_key" ON "ciclo_resena"("reserva_id");

-- CreateIndex
CREATE UNIQUE INDEX "ciclo_resena_token_hash_key" ON "ciclo_resena"("token_hash");

-- CreateIndex
CREATE INDEX "ciclo_resena_desbloqueado_en_idx" ON "ciclo_resena"("desbloqueado_en");

-- CreateIndex
CREATE UNIQUE INDEX "resena_cabana_reserva_id_key" ON "resena_cabana"("reserva_id");

-- CreateIndex
CREATE INDEX "resena_cabana_cabana_id_estado_publicada_en_idx" ON "resena_cabana"("cabana_id", "estado", "publicada_en");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_resena_resena_id_key" ON "respuesta_resena"("resena_id");

-- CreateIndex
CREATE INDEX "reporte_resena_estado_created_at_idx" ON "reporte_resena"("estado", "created_at");

-- CreateIndex
CREATE INDEX "reporte_resena_resena_id_idx" ON "reporte_resena"("resena_id");

-- CreateIndex
CREATE UNIQUE INDEX "resena_huesped_reserva_id_key" ON "resena_huesped"("reserva_id");

-- CreateIndex
CREATE INDEX "resena_huesped_huesped_id_estado_idx" ON "resena_huesped"("huesped_id", "estado");

-- CreateIndex
CREATE INDEX "resena_huesped_propiedad_id_idx" ON "resena_huesped"("propiedad_id");

-- CreateIndex
CREATE UNIQUE INDEX "replica_huesped_resena_id_key" ON "replica_huesped"("resena_id");

-- CreateIndex
CREATE INDEX "solicitud_privacidad_estado_created_at_idx" ON "solicitud_privacidad"("estado", "created_at");

-- CreateIndex
CREATE INDEX "reserva_huesped_id_idx" ON "reserva"("huesped_id");

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciclo_resena" ADD CONSTRAINT "ciclo_resena_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena_cabana" ADD CONSTRAINT "resena_cabana_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena_cabana" ADD CONSTRAINT "resena_cabana_cabana_id_fkey" FOREIGN KEY ("cabana_id") REFERENCES "cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_resena" ADD CONSTRAINT "respuesta_resena_resena_id_fkey" FOREIGN KEY ("resena_id") REFERENCES "resena_cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte_resena" ADD CONSTRAINT "reporte_resena_resena_id_fkey" FOREIGN KEY ("resena_id") REFERENCES "resena_cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena_huesped" ADD CONSTRAINT "resena_huesped_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena_huesped" ADD CONSTRAINT "resena_huesped_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena_huesped" ADD CONSTRAINT "resena_huesped_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replica_huesped" ADD CONSTRAINT "replica_huesped_resena_id_fkey" FOREIGN KEY ("resena_id") REFERENCES "resena_huesped"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_privacidad" ADD CONSTRAINT "solicitud_privacidad_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Escrito a mano: validaciones, configuración, RLS y la vista de reputación compartida.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "resena_cabana" ADD CONSTRAINT "resena_cabana_notas_validas" CHECK (
  "limpieza" BETWEEN 1 AND 5 AND "ubicacion" BETWEEN 1 AND 5 AND "comunicacion" BETWEEN 1 AND 5
  AND "veracidad" BETWEEN 1 AND 5 AND "calidad_precio" BETWEEN 1 AND 5);
ALTER TABLE "resena_cabana" ADD CONSTRAINT "resena_cabana_comentario_largo" CHECK (char_length("comentario") BETWEEN 1 AND 1000);
ALTER TABLE "resena_cabana" ADD CONSTRAINT "resena_cabana_nombre_largo" CHECK (char_length("nombre_publico") BETWEEN 1 AND 40);
ALTER TABLE "respuesta_resena" ADD CONSTRAINT "respuesta_resena_texto_largo" CHECK (char_length("texto") BETWEEN 1 AND 1000);
ALTER TABLE "reporte_resena" ADD CONSTRAINT "reporte_resena_detalle_largo" CHECK (char_length("detalle") <= 500);
ALTER TABLE "resena_huesped" ADD CONSTRAINT "resena_huesped_comentario_largo" CHECK (char_length("comentario") <= 1000);
ALTER TABLE "resena_huesped" ADD CONSTRAINT "resena_huesped_etiquetas_validas" CHECK ("etiquetas" <@ ARRAY[
  'respetuoso', 'dejo_limpio', 'cumplio_normas', 'ruidoso', 'danos', 'cumplio_horarios', 'comunicacion_fluida']::TEXT[]);
ALTER TABLE "replica_huesped" ADD CONSTRAINT "replica_huesped_texto_largo" CHECK (char_length("texto") BETWEEN 1 AND 1000);
ALTER TABLE "solicitud_privacidad" ADD CONSTRAINT "solicitud_privacidad_mensaje_largo" CHECK (char_length("mensaje") BETWEEN 1 AND 2000);

-- Una sola fila de configuración. La reputación compartida entre dueños queda APAGADA.
ALTER TABLE "configuracion_plataforma" ADD CONSTRAINT "configuracion_plataforma_una_fila" CHECK ("id" = 1);
INSERT INTO "configuracion_plataforma" ("id", "compartir_reputacion") VALUES (1, false);

-- RLS en todas las tablas nuevas (regla del proyecto). Sin políticas para anon/authenticated:
-- la API pública de Supabase no ve nada. El servidor (postgres) tiene BYPASSRLS.
ALTER TABLE "huesped" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ciclo_resena" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resena_cabana" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "respuesta_resena" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reporte_resena" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resena_huesped" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "replica_huesped" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "solicitud_privacidad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "configuracion_plataforma" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "superadmin" ENABLE ROW LEVEL SECURITY;

-- Panel del dueño (panel_admin, ver migración admin_por_propiedad_y_rls_panel). "reserva" y
-- "cabana" ya vienen filtradas por sus políticas: solo las de las propiedades del usuario.
-- superadmin y solicitud_privacidad: sin permisos (solo el servidor, después de verificar al superadmin).
GRANT SELECT ON "huesped", "ciclo_resena", "resena_cabana", "replica_huesped", "configuracion_plataforma" TO panel_admin;
GRANT UPDATE ("whatsapp_abierto_en") ON "ciclo_resena" TO panel_admin;
GRANT SELECT, INSERT, UPDATE ON "respuesta_resena", "resena_huesped" TO panel_admin;
GRANT SELECT, INSERT ON "reporte_resena" TO panel_admin;

-- Huéspedes de sus reservas.
CREATE POLICY "panel_huesped" ON "huesped" FOR SELECT TO panel_admin
  USING ("id" IN (SELECT "huesped_id" FROM "reserva"));

CREATE POLICY "panel_ciclo_resena" ON "ciclo_resena" FOR ALL TO panel_admin
  USING ("reserva_id" IN (SELECT "id" FROM "reserva"))
  WITH CHECK ("reserva_id" IN (SELECT "id" FROM "reserva"));

-- Doble ciego: el dueño no ve el contenido de una reseña retenida. No puede editarla ni borrarla
-- (sin UPDATE ni DELETE): solo responder y reportar.
CREATE POLICY "panel_resena_cabana" ON "resena_cabana" FOR SELECT TO panel_admin
  USING ("cabana_id" IN (SELECT "id" FROM "cabana") AND "estado" <> 'retenida');

CREATE POLICY "panel_respuesta_resena" ON "respuesta_resena" FOR ALL TO panel_admin
  USING ("resena_id" IN (SELECT "id" FROM "resena_cabana"))
  WITH CHECK (
    "resena_id" IN (SELECT "id" FROM "resena_cabana" WHERE "estado" = 'publicada')
    AND "autor_usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid);

CREATE POLICY "panel_reporte_resena" ON "reporte_resena" FOR ALL TO panel_admin
  USING ("resena_id" IN (SELECT "id" FROM "resena_cabana"))
  WITH CHECK (
    "resena_id" IN (SELECT "id" FROM "resena_cabana")
    AND "usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid);

-- Reseñas privadas del huésped: SOLO las de las propiedades del usuario, aunque compartir_reputacion
-- esté encendido (lo compartido es solo el resumen, por la vista de abajo). Se editan mientras están
-- retenidas (antes del desbloqueo del doble ciego).
CREATE POLICY "panel_resena_huesped_leer" ON "resena_huesped" FOR SELECT TO panel_admin
  USING ("propiedad_id" IN (SELECT "propiedad_id" FROM "admin"));

CREATE POLICY "panel_resena_huesped_crear" ON "resena_huesped" FOR INSERT TO panel_admin
  WITH CHECK (
    "propiedad_id" IN (SELECT "propiedad_id" FROM "admin")
    AND "reserva_id" IN (
      SELECT r."id" FROM "reserva" r JOIN "cabana" c ON c."id" = r."cabana_id"
      WHERE c."propiedad_id" = "resena_huesped"."propiedad_id")
    AND "autor_usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid);

CREATE POLICY "panel_resena_huesped_editar" ON "resena_huesped" FOR UPDATE TO panel_admin
  USING ("propiedad_id" IN (SELECT "propiedad_id" FROM "admin") AND "estado" = 'retenida')
  WITH CHECK ("propiedad_id" IN (SELECT "propiedad_id" FROM "admin") AND "estado" = 'retenida');

CREATE POLICY "panel_replica_huesped" ON "replica_huesped" FOR SELECT TO panel_admin
  USING ("resena_id" IN (SELECT "id" FROM "resena_huesped"));

CREATE POLICY "panel_configuracion" ON "configuracion_plataforma" FOR SELECT TO panel_admin USING (true);

-- Reputación del huésped entre dueños (PREPARADA, APAGADA). Solo el resumen (calificación y
-- etiquetas, nunca el comentario) de reseñas publicadas. Corre con los permisos de su dueño
-- (postgres), así que filtra a mano: las de las propiedades del usuario siempre, y las de otros
-- dueños SOLO si configuracion_plataforma.compartir_reputacion = true.
CREATE VIEW "reputacion_compartida" WITH (security_barrier) AS
  SELECT rh."huesped_id", rh."propiedad_id", rh."calificacion", rh."etiquetas", rh."publicada_en"
  FROM "resena_huesped" rh
  WHERE rh."estado" = 'publicada'
    AND (
      rh."propiedad_id" IN (
        SELECT a."propiedad_id" FROM "admin" a
        WHERE a."usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid)
      OR (SELECT c."compartir_reputacion" FROM "configuracion_plataforma" c WHERE c."id" = 1)
    );

REVOKE ALL ON "reputacion_compartida" FROM PUBLIC;
GRANT SELECT ON "reputacion_compartida" TO panel_admin;

