-- Restricciones que Prisma no soporta en el schema (escrita a mano).
-- Todos los rangos son [desde, hasta): el último día es EXCLUSIVO (ver CLAUDE.md).

-- btree_gist permite combinar igualdad de uuid (cabana_id) con traslape de rangos en un índice GiST.
-- Supabase recomienda instalar extensiones en el schema "extensions". El "create schema" es para
-- la base shadow de `prisma migrate dev`, que no trae ese schema.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- Anti doble reserva: una misma cabaña no puede tener dos reservas activas que se traslapen.
-- '[)' hace que el día de check_out quede libre para otra llegada.
-- Las reservas canceladas o completadas no bloquean fechas.
alter table "reserva" add constraint "reserva_sin_traslape"
  exclude using gist (
    "cabana_id" with =,
    daterange("check_in", "check_out", '[)') with &&
  )
  where ("estado" in ('pendiente_pago', 'confirmada'));

-- Rangos no vacíos (estricto porque el fin es exclusivo).
alter table "reserva" add constraint "reserva_check_out_despues_de_check_in"
  check ("check_out" > "check_in");

alter table "temporada" add constraint "temporada_hasta_despues_de_desde"
  check ("hasta" > "desde");

alter table "bloqueo" add constraint "bloqueo_hasta_despues_de_desde"
  check ("hasta" > "desde");
