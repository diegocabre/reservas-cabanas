-- La auditoría también registra quién crea y elimina bloqueos de fechas.
ALTER TYPE "accion_auditoria" ADD VALUE 'crear_bloqueo';
ALTER TYPE "accion_auditoria" ADD VALUE 'eliminar_bloqueo';

ALTER TABLE "auditoria" ADD COLUMN "bloqueo_id" UUID,
ADD COLUMN "cabana_id" UUID,
ALTER COLUMN "reserva_id" DROP NOT NULL,
ALTER COLUMN "estado_antes" DROP NOT NULL,
ALTER COLUMN "estado_despues" DROP NOT NULL;

CREATE INDEX "auditoria_cabana_id_created_at_idx" ON "auditoria"("cabana_id", "created_at");
CREATE INDEX "auditoria_bloqueo_id_idx" ON "auditoria"("bloqueo_id");

ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_cabana_id_fkey" FOREIGN KEY ("cabana_id") REFERENCES "cabana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Todo registro es de una reserva o de una cabaña (bloqueos).
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_de_reserva_o_cabana" CHECK ("reserva_id" IS NOT NULL OR "cabana_id" IS NOT NULL);

-- ---------------------------------------------------------------------------------------------
-- RLS (escrito a mano): las políticas ahora aceptan registros de reservas O de cabañas del admin.
-- Sigue siendo solo insertar y leer, y solo a nombre del usuario de la sesión.
-- ---------------------------------------------------------------------------------------------
drop policy "panel_auditoria_leer" on "auditoria";
drop policy "panel_auditoria_agregar" on "auditoria";

create policy "panel_auditoria_leer" on "auditoria" for select to panel_admin
  using (
    "reserva_id" in (select "id" from "reserva")
    or "cabana_id" in (select "id" from "cabana")
  );

create policy "panel_auditoria_agregar" on "auditoria" for insert to panel_admin
  with check (
    ("reserva_id" in (select "id" from "reserva") or "cabana_id" in (select "id" from "cabana"))
    and "usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid
  );
