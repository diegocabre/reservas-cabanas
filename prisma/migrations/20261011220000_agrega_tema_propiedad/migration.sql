-- Colores propios de cada propiedad (lib/tema.ts). null = paleta base de app/globals.css.
-- Tabla existente con RLS ya activado; panel_admin la lee por la política panel_propiedad.
ALTER TABLE "propiedad" ADD COLUMN "tema" JSONB;
