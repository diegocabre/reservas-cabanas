-- Cuenta de Mercado Pago de cada propiedad (OAuth) y auditoría de su conexión.
ALTER TYPE "accion_auditoria" ADD VALUE 'conectar_mercadopago';
ALTER TYPE "accion_auditoria" ADD VALUE 'desconectar_mercadopago';

ALTER TABLE "auditoria" ADD COLUMN "propiedad_id" UUID;
CREATE INDEX "auditoria_propiedad_id_created_at_idx" ON "auditoria"("propiedad_id", "created_at");
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cuenta_mercadopago" (
    "id" UUID NOT NULL,
    "propiedad_id" UUID NOT NULL,
    "mp_user_id" TEXT NOT NULL,
    "access_token_cifrado" TEXT NOT NULL,
    "refresh_token_cifrado" TEXT NOT NULL,
    "public_key" TEXT,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "produccion" BOOLEAN NOT NULL,
    "conectada_por" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cuenta_mercadopago_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cuenta_mercadopago_propiedad_id_key" ON "cuenta_mercadopago"("propiedad_id");
CREATE INDEX "cuenta_mercadopago_mp_user_id_idx" ON "cuenta_mercadopago"("mp_user_id");
ALTER TABLE "cuenta_mercadopago" ADD CONSTRAINT "cuenta_mercadopago_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RLS (escrito a mano). cuenta_mercadopago: RLS activado, SIN políticas y SIN permisos para
-- panel_admin ni la API pública. Los tokens (cifrados) solo los lee el servidor como postgres.
-- ---------------------------------------------------------------------------------------------
alter table "cuenta_mercadopago" enable row level security;
revoke all on "cuenta_mercadopago" from panel_admin;

-- Auditoría: ahora también registros de la propiedad (conectar o desconectar Mercado Pago).
alter table "auditoria" drop constraint "auditoria_de_reserva_o_cabana";
alter table "auditoria" add constraint "auditoria_de_reserva_cabana_o_propiedad"
  check ("reserva_id" is not null or "cabana_id" is not null or "propiedad_id" is not null);

drop policy "panel_auditoria_leer" on "auditoria";
drop policy "panel_auditoria_agregar" on "auditoria";

create policy "panel_auditoria_leer" on "auditoria" for select to panel_admin
  using (
    "reserva_id" in (select "id" from "reserva")
    or "cabana_id" in (select "id" from "cabana")
    or "propiedad_id" in (select "propiedad_id" from "admin")
  );

create policy "panel_auditoria_agregar" on "auditoria" for insert to panel_admin
  with check (
    (
      "reserva_id" in (select "id" from "reserva")
      or "cabana_id" in (select "id" from "cabana")
      or "propiedad_id" in (select "propiedad_id" from "admin")
    )
    and "usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid
  );
