-- Prefijo y correlativo para los códigos de reserva (ej. LL-0001).
-- AlterTable
ALTER TABLE "propiedad" ADD COLUMN     "prefijo_codigo" TEXT NOT NULL DEFAULT 'RES',
ADD COLUMN     "ultimo_correlativo" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "propiedad_prefijo_codigo_key" ON "propiedad"("prefijo_codigo");
