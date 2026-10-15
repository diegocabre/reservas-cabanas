-- La vista reputacion_compartida corre con los permisos de su dueño (postgres) y no aplica RLS.
-- Supabase da por defecto todos los permisos de cada tabla o vista nueva a anon y authenticated
-- (la API pública); el "revoke from public" de 20261016120000_resenas no los quita. Sin esto, con
-- compartir_reputacion encendido, la API pública podría leer los resúmenes. Solo panel_admin la lee.
-- Reversa: no hace falta (volver a dar el permiso abriría la vista a la API pública).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "reputacion_compartida" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "reputacion_compartida" FROM authenticated;
  END IF;
END
$$;
