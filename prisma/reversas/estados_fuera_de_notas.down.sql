-- Reversa de 20261017130000_estados_fuera_de_notas. Correr a mano y LUEGO:
--   delete from "_prisma_migrations" where migration_name = '20261017130000_estados_fuera_de_notas';
-- Ojo: se pierden las marcas de prueba y de pago por revisar guardadas en las columnas. Antes de
-- correrla, revisar: select codigo, es_prueba, revisar_pago, revisar_pago_motivo from reserva
--   where es_prueba or revisar_pago;
-- y volver al código anterior (que lee las marcas desde notas).
begin;
alter table "reserva" drop column "es_prueba", drop column "revisar_pago", drop column "revisar_pago_motivo";
commit;
