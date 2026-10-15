-- Reversa de 20261016120000_resenas. Correr a mano (psql / SQL editor de Supabase) y LUEGO:
--   delete from "_prisma_migrations" where migration_name = '20261016120000_resenas';
-- y volver al código anterior a la rama feat/resenas.
--
-- BORRA todas las reseñas, respuestas, reportes, réplicas, solicitudes de privacidad y huéspedes.
-- Las reservas no se tocan (solo pierden la columna huesped_id). Respáldalas antes si importan:
--   select count(*) from resena_cabana; select count(*) from resena_huesped;

begin;

drop view if exists "reputacion_compartida";

drop table if exists "replica_huesped";
drop table if exists "resena_huesped";
drop table if exists "respuesta_resena";
drop table if exists "reporte_resena";
drop table if exists "resena_cabana";
drop table if exists "ciclo_resena";
drop table if exists "solicitud_privacidad";
drop table if exists "configuracion_plataforma";
drop table if exists "superadmin";

alter table "reserva" drop constraint if exists "reserva_huesped_id_fkey";
-- Antes que la columna: la política panel_huesped depende de reserva.huesped_id.
drop table if exists "huesped";
drop index if exists "reserva_huesped_id_idx";
alter table "reserva" drop column if exists "huesped_id";

drop type if exists "estado_resena";
drop type if exists "calificacion_huesped";
drop type if exists "motivo_reporte";
drop type if exists "estado_moderacion";
drop type if exists "tipo_solicitud_privacidad";

commit;
