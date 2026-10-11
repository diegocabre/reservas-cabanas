-- Admin por propiedad: un usuario de Supabase Auth puede administrar varias propiedades
-- (una fila por usuario y propiedad). En la base no había admins al crear esta migración.
DROP INDEX "admin_email_key";
ALTER TABLE "admin" ADD COLUMN "usuario_id" UUID NOT NULL;
CREATE UNIQUE INDEX "admin_usuario_id_propiedad_id_key" ON "admin"("usuario_id", "propiedad_id");

-- ---------------------------------------------------------------------------------------------
-- RLS del panel del dueño (escrito a mano).
--
-- La app pública sigue usando "postgres" (BYPASSRLS). Las consultas del panel, en cambio, corren
-- dentro de una transacción con `set local role panel_admin` y `app.usuario_id` = id del usuario
-- de Supabase Auth (lib/panel-acceso.ts). Ese rol NO salta RLS: aunque el código olvide un filtro,
-- Postgres solo le entrega y le deja cambiar datos de las propiedades de ese usuario.
--
-- La API pública de Supabase sigue sin acceso: las políticas son solo para panel_admin, y ni
-- anon ni authenticated pueden asumir ese rol.
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'panel_admin') then
    create role panel_admin nologin noinherit;
  end if;
end
$$;

-- "postgres" puede cambiarse a panel_admin (SET), pero no hereda nada de él.
grant panel_admin to postgres with inherit false, set true;

grant usage on schema public to panel_admin;
grant select on "admin", "propiedad", "cabana", "tarifa", "temporada", "calendario_externo" to panel_admin;
grant select, insert, update, delete on "reserva", "pago", "bloqueo" to panel_admin;

-- Las propiedades del usuario de la sesión. Si app.usuario_id no está definido, no ve nada.
create policy "panel_admin_propio" on "admin" for select to panel_admin
  using ("usuario_id" = nullif(current_setting('app.usuario_id', true), '')::uuid);

-- Las demás políticas se apoyan en la anterior: dentro de ellas, "admin" ya viene filtrada.
create policy "panel_propiedad" on "propiedad" for select to panel_admin
  using ("id" in (select "propiedad_id" from "admin"));

create policy "panel_cabana" on "cabana" for select to panel_admin
  using ("propiedad_id" in (select "propiedad_id" from "admin"));

create policy "panel_tarifa" on "tarifa" for select to panel_admin
  using ("cabana_id" in (select "id" from "cabana"));

create policy "panel_temporada" on "temporada" for select to panel_admin
  using ("cabana_id" in (select "id" from "cabana"));

create policy "panel_calendario_externo" on "calendario_externo" for select to panel_admin
  using ("cabana_id" in (select "id" from "cabana"));

-- Reservas, pagos y bloqueos: leer y escribir solo en sus cabañas. WITH CHECK impide crear o
-- mover una fila hacia una cabaña (o reserva) de otra propiedad.
create policy "panel_reserva" on "reserva" for all to panel_admin
  using ("cabana_id" in (select "id" from "cabana"))
  with check ("cabana_id" in (select "id" from "cabana"));

create policy "panel_bloqueo" on "bloqueo" for all to panel_admin
  using ("cabana_id" in (select "id" from "cabana"))
  with check ("cabana_id" in (select "id" from "cabana"));

create policy "panel_pago" on "pago" for all to panel_admin
  using ("reserva_id" in (select "id" from "reserva"))
  with check ("reserva_id" in (select "id" from "reserva"));
