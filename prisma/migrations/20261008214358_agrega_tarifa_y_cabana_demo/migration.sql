-- Precios fijos por personas y noches (reemplazan a las temporadas en el cálculo; la tabla temporada se mantiene).
-- Solo agrega: no borra ni cambia datos existentes.

-- AlterTable
ALTER TABLE "cabana" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tarifa" (
    "id" UUID NOT NULL,
    "cabana_id" UUID NOT NULL,
    "personas_desde" INTEGER NOT NULL,
    "personas_hasta" INTEGER NOT NULL,
    "noches_desde" INTEGER NOT NULL,
    "precio_noche" INTEGER NOT NULL,

    CONSTRAINT "tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarifa_cabana_id_personas_desde_noches_desde_key" ON "tarifa"("cabana_id", "personas_desde", "noches_desde");

-- AddForeignKey
ALTER TABLE "tarifa" ADD CONSTRAINT "tarifa_cabana_id_fkey" FOREIGN KEY ("cabana_id") REFERENCES "cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escrito a mano: valores con sentido (Prisma no soporta checks en el schema).
alter table "tarifa" add constraint "tarifa_personas_validas"
  check ("personas_desde" >= 1 and "personas_hasta" >= "personas_desde");
alter table "tarifa" add constraint "tarifa_noches_validas" check ("noches_desde" >= 1);
alter table "tarifa" add constraint "tarifa_precio_positivo" check ("precio_noche" > 0);
alter table "cabana" add constraint "cabana_min_noches_valido" check ("min_noches" >= 1);

-- RLS activado y sin políticas, como todas las tablas: solo Prisma (rol postgres) accede.
alter table "tarifa" enable row level security;
