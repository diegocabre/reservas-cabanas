-- Activa Row Level Security en todas las tablas del schema public, SIN políticas.
-- Toda lectura y escritura pasa por Prisma en el servidor, que se conecta como "postgres"
-- (dueño de las tablas y con BYPASSRLS), así que no le afecta. Sin políticas, los roles de la
-- API pública de Supabase (anon y authenticated) no pueden leer ni escribir nada.
--
-- Regla (ver CLAUDE.md): toda tabla nueva debe activar RLS en su propia migración.

alter table "propiedad" enable row level security;
alter table "admin" enable row level security;
alter table "cabana" enable row level security;
alter table "temporada" enable row level security;
alter table "reserva" enable row level security;
alter table "pago" enable row level security;
alter table "bloqueo" enable row level security;
alter table "calendario_externo" enable row level security;

-- Historial de migraciones de Prisma: también vive en public y quedaría expuesto por la API.
-- Condicional porque en la base shadow de `migrate dev` esa tabla no existe.
do $$
begin
  if to_regclass('public._prisma_migrations') is not null then
    alter table "_prisma_migrations" enable row level security;
  end if;
end
$$;
