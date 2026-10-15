-- Aprobación manual de reservas por cabaña. Todas las cabañas existentes quedan con la aprobación
-- APAGADA (default false): el flujo actual (reserva → pago → confirmada) no cambia.
-- Reversa: prisma/reversas/aprobacion_reservas.down.sql

-- Configuración por cabaña.
ALTER TABLE "cabana"
  ADD COLUMN "requiere_aprobacion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "horas_respuesta_aprobacion" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "horas_para_pagar" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "cabana" ADD CONSTRAINT "cabana_horas_aprobacion_validas"
  CHECK ("horas_respuesta_aprobacion" BETWEEN 1 AND 168 AND "horas_para_pagar" BETWEEN 1 AND 168);

-- Seguimiento de solicitudes (todas opcionales: las reservas existentes quedan en null).
ALTER TABLE "reserva"
  ADD COLUMN "aprobada_en" TIMESTAMPTZ(3),
  ADD COLUMN "link_pago" TEXT,
  ADD COLUMN "link_pago_expira_en" TIMESTAMPTZ(3),
  ADD COLUMN "whatsapp_abierto_en" TIMESTAMPTZ(3),
  ADD COLUMN "recordatorio_dueno_en" TIMESTAMPTZ(3),
  ADD COLUMN "recordatorio_huesped_en" TIMESTAMPTZ(3),
  ADD COLUMN "expiracion_avisada_en" TIMESTAMPTZ(3),
  ADD COLUMN "aviso_fallido" TEXT;

-- Anti doble reserva (escrito a mano): las solicitudes pendientes y las aprobadas por pagar también
-- retienen las fechas. Rechazadas, expiradas, canceladas y completadas no.
ALTER TABLE "reserva" DROP CONSTRAINT "reserva_sin_traslape";
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_sin_traslape"
  EXCLUDE USING gist (
    "cabana_id" WITH =,
    daterange("check_in", "check_out", '[)') WITH &&
  )
  WHERE ("estado" IN ('pendiente_pago', 'confirmada', 'pendiente_aprobacion', 'aprobada_pendiente_pago'));

-- ---------------------------------------------------------------------------------------------
-- RLS del panel (escrito a mano): el dueño cambia la configuración de aprobación de SUS cabañas.
-- Solo esas tres columnas, y solo en propiedades donde su fila de admin tiene rol "dueno".
-- ---------------------------------------------------------------------------------------------
GRANT UPDATE ("requiere_aprobacion", "horas_respuesta_aprobacion", "horas_para_pagar") ON "cabana" TO panel_admin;

CREATE POLICY "panel_cabana_configurar" ON "cabana" FOR UPDATE TO panel_admin
  USING ("propiedad_id" IN (SELECT "propiedad_id" FROM "admin" WHERE "rol" = 'dueno'))
  WITH CHECK ("propiedad_id" IN (SELECT "propiedad_id" FROM "admin" WHERE "rol" = 'dueno'));
