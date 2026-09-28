-- CreateEnum
CREATE TYPE "rol_admin" AS ENUM ('dueno', 'staff');

-- CreateEnum
CREATE TYPE "estado_reserva" AS ENUM ('pendiente_pago', 'confirmada', 'cancelada', 'completada');

-- CreateEnum
CREATE TYPE "origen_reserva" AS ENUM ('web', 'airbnb', 'booking', 'manual');

-- CreateEnum
CREATE TYPE "proveedor_pago" AS ENUM ('mercadopago', 'flow', 'transferencia');

-- CreateEnum
CREATE TYPE "estado_pago" AS ENUM ('pendiente', 'aprobado', 'rechazado');

-- CreateEnum
CREATE TYPE "origen_bloqueo" AS ENUM ('manual', 'ical');

-- CreateEnum
CREATE TYPE "plataforma" AS ENUM ('airbnb', 'booking');

-- CreateTable
CREATE TABLE "propiedad" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "abono_pct" INTEGER NOT NULL DEFAULT 50,
    "politica_cancelacion" TEXT,
    "instrucciones_llegada" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "propiedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin" (
    "id" UUID NOT NULL,
    "propiedad_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "rol" "rol_admin" NOT NULL DEFAULT 'dueno',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabana" (
    "id" UUID NOT NULL,
    "propiedad_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "dormitorios" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "servicios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_noches" INTEGER NOT NULL DEFAULT 1,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cabana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporada" (
    "id" UUID NOT NULL,
    "cabana_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "precio_noche" INTEGER NOT NULL,
    "min_noches" INTEGER,

    CONSTRAINT "temporada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "cabana_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "adultos" INTEGER NOT NULL,
    "ninos" INTEGER NOT NULL DEFAULT 0,
    "huesped_nombre" TEXT NOT NULL,
    "huesped_email" TEXT NOT NULL,
    "huesped_telefono" TEXT NOT NULL,
    "huesped_rut" TEXT,
    "total" INTEGER NOT NULL,
    "abono" INTEGER NOT NULL,
    "estado" "estado_reserva" NOT NULL DEFAULT 'pendiente_pago',
    "origen" "origen_reserva" NOT NULL DEFAULT 'web',
    "expira_en" TIMESTAMPTZ(3),
    "notas" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "proveedor" "proveedor_pago" NOT NULL,
    "monto" INTEGER NOT NULL,
    "estado" "estado_pago" NOT NULL DEFAULT 'pendiente',
    "ref_externa" TEXT,
    "pagado_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueo" (
    "id" UUID NOT NULL,
    "cabana_id" UUID NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "motivo" TEXT,
    "origen" "origen_bloqueo" NOT NULL DEFAULT 'manual',
    "uid_externo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendario_externo" (
    "id" UUID NOT NULL,
    "cabana_id" UUID NOT NULL,
    "plataforma" "plataforma" NOT NULL,
    "url_ical" TEXT NOT NULL,
    "ultimo_sync" TIMESTAMPTZ(3),

    CONSTRAINT "calendario_externo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "propiedad_slug_key" ON "propiedad"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

-- CreateIndex
CREATE INDEX "admin_propiedad_id_idx" ON "admin"("propiedad_id");

-- CreateIndex
CREATE UNIQUE INDEX "cabana_propiedad_id_slug_key" ON "cabana"("propiedad_id", "slug");

-- CreateIndex
CREATE INDEX "temporada_cabana_id_desde_idx" ON "temporada"("cabana_id", "desde");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_codigo_key" ON "reserva"("codigo");

-- CreateIndex
CREATE INDEX "reserva_cabana_id_check_in_idx" ON "reserva"("cabana_id", "check_in");

-- CreateIndex
CREATE INDEX "reserva_estado_expira_en_idx" ON "reserva"("estado", "expira_en");

-- CreateIndex
CREATE INDEX "pago_reserva_id_idx" ON "pago"("reserva_id");

-- CreateIndex
CREATE INDEX "pago_ref_externa_idx" ON "pago"("ref_externa");

-- CreateIndex
CREATE INDEX "bloqueo_cabana_id_desde_idx" ON "bloqueo"("cabana_id", "desde");

-- CreateIndex
CREATE UNIQUE INDEX "bloqueo_cabana_id_uid_externo_key" ON "bloqueo"("cabana_id", "uid_externo");

-- CreateIndex
CREATE UNIQUE INDEX "calendario_externo_cabana_id_plataforma_key" ON "calendario_externo"("cabana_id", "plataforma");

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabana" ADD CONSTRAINT "cabana_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporada" ADD CONSTRAINT "temporada_cabana_id_fkey" FOREIGN KEY ("cabana_id") REFERENCES "cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_cabana_id_fkey" FOREIGN KEY ("cabana_id") REFERENCES "cabana"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueo" ADD CONSTRAINT "bloqueo_cabana_id_fkey" FOREIGN KEY ("cabana_id") REFERENCES "cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendario_externo" ADD CONSTRAINT "calendario_externo_cabana_id_fkey" FOREIGN KEY ("cabana_id") REFERENCES "cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;
