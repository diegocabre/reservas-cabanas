-- Reversa de 20261016140000_plataforma_propiedad. Correr a mano y LUEGO:
--   delete from "_prisma_migrations" where migration_name = '20261016140000_plataforma_propiedad';
-- Ojo: reactiva todas las propiedades suspendidas y apaga las reseñas de todas.
begin;
alter table "propiedad" drop column "resenas", drop column "suspendida", drop column "suspendida_en", drop column "suspendida_por";
drop type "etapa_resenas";
commit;
