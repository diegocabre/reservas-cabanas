-- Reversa de 20261015120000_aprobacion_estados y 20261015120100_aprobacion_reservas.
-- Correr a mano (psql / SQL editor de Supabase) y LUEGO borrar las dos filas de _prisma_migrations:
--   delete from "_prisma_migrations" where migration_name in
--     ('20261015120000_aprobacion_estados', '20261015120100_aprobacion_reservas');
-- y volver al código anterior a la rama feat/aprobacion-reservas.
--
-- Las reservas en estados nuevos pasan a "cancelada" (las vivas, con una nota) para poder quitar
-- los valores del enum. Revisa antes cuántas hay:
--   select estado, count(*) from reserva where estado::text in
--     ('pendiente_aprobacion','aprobada_pendiente_pago','rechazada','expirada') group by 1;

begin;

update "reserva"
set "notas" = concat_ws(E'\n', "notas", '[REVERSA] solicitud ' || "estado"::text || ' cancelada al quitar la aprobación manual'),
    "estado" = 'cancelada'
where "estado"::text in ('pendiente_aprobacion', 'aprobada_pendiente_pago', 'rechazada', 'expirada');

delete from "auditoria" where "accion"::text in ('aprobar', 'rechazar', 'nuevo_link_pago', 'configurar_cabana');
update "auditoria" set "estado_antes" = 'cancelada'
  where "estado_antes"::text in ('pendiente_aprobacion', 'aprobada_pendiente_pago', 'rechazada', 'expirada');
update "auditoria" set "estado_despues" = 'cancelada'
  where "estado_despues"::text in ('pendiente_aprobacion', 'aprobada_pendiente_pago', 'rechazada', 'expirada');

drop policy if exists "panel_cabana_configurar" on "cabana";
revoke update ("requiere_aprobacion", "horas_respuesta_aprobacion", "horas_para_pagar") on "cabana" from panel_admin;

alter table "reserva" drop constraint "reserva_sin_traslape";

alter table "reserva"
  drop column "aprobada_en",
  drop column "link_pago",
  drop column "link_pago_expira_en",
  drop column "whatsapp_abierto_en",
  drop column "recordatorio_dueno_en",
  drop column "recordatorio_huesped_en",
  drop column "expiracion_avisada_en",
  drop column "aviso_fallido";

alter table "cabana" drop constraint "cabana_horas_aprobacion_validas";
alter table "cabana"
  drop column "requiere_aprobacion",
  drop column "horas_respuesta_aprobacion",
  drop column "horas_para_pagar";

-- Postgres no borra valores de un enum: se recrea el tipo con los valores originales.
alter type "estado_reserva" rename to "estado_reserva_old";
create type "estado_reserva" as enum ('pendiente_pago', 'confirmada', 'cancelada', 'completada');
alter table "reserva" alter column "estado" drop default;
alter table "reserva" alter column "estado" type "estado_reserva" using "estado"::text::"estado_reserva";
alter table "reserva" alter column "estado" set default 'pendiente_pago';
alter table "auditoria" alter column "estado_antes" type "estado_reserva" using "estado_antes"::text::"estado_reserva";
alter table "auditoria" alter column "estado_despues" type "estado_reserva" using "estado_despues"::text::"estado_reserva";
drop type "estado_reserva_old";

alter type "accion_auditoria" rename to "accion_auditoria_old";
create type "accion_auditoria" as enum (
  'confirmar', 'cancelar', 'registrar_pago', 'marcar_revisado', 'crear_bloqueo', 'eliminar_bloqueo',
  'conectar_mercadopago', 'desconectar_mercadopago'
);
alter table "auditoria" alter column "accion" type "accion_auditoria" using "accion"::text::"accion_auditoria";
drop type "accion_auditoria_old";

alter table "reserva" add constraint "reserva_sin_traslape"
  exclude using gist (
    "cabana_id" with =,
    daterange("check_in", "check_out", '[)') with &&
  )
  where ("estado" in ('pendiente_pago', 'confirmada'));

commit;
