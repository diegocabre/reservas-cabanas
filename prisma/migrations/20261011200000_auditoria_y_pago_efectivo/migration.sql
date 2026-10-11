-- Pago del saldo en efectivo (lo registra el dueño en el panel).
ALTER TYPE "proveedor_pago" ADD VALUE 'efectivo';

-- Auditoría de las acciones del panel: quién cambió qué reserva y cuándo.
CREATE TYPE "accion_auditoria" AS ENUM ('confirmar', 'cancelar', 'registrar_pago', 'marcar_revisado');

CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "accion" "accion_auditoria" NOT NULL,
    "estado_antes" "estado_reserva" NOT NULL,
    "estado_despues" "estado_reserva" NOT NULL,
    "detalle" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auditoria_reserva_id_created_at_idx" ON "auditoria"("reserva_id", "created_at");

ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RLS (escrito a mano). Regla del proyecto: toda tabla nueva activa RLS. La API pública
-- (anon, authenticated) sigue sin acceso.
--
-- panel_admin solo puede INSERTAR y LEER auditoría de reservas de sus propiedades, y solo a su
-- nombre (usuario_id = el de la sesión): no puede editar ni borrar el historial, ni firmar por otro.
-- ---------------------------------------------------------------------------------------------
alter table "auditoria" enable row level security;

grant select, insert on "auditoria" to panel_admin;

create policy "panel_auditoria_leer" on "auditoria" for select to panel_admin
  using ("reserva_id" in (select "id" from "reserva"));

create policy "panel_auditoria_agregar" on "auditoria" for insert to panel_admin
  with check (
    "reserva_id" in (select "id" from "reserva")
    and "usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid
  );

-- El panel no borra reservas ni pagos (se cancelan): sin DELETE, el borrado en cascada no puede
-- llevarse la auditoría por delante.
revoke delete on "reserva", "pago" from panel_admin;
