-- Reversa de 20261017120000_intentos_publicos. Correr a mano y LUEGO:
--   delete from "_prisma_migrations" where migration_name = '20261017120000_intentos_publicos';
-- Solo se pierden los contadores de intentos (datos temporales).
begin;
drop table "intentos_publicos";
commit;
