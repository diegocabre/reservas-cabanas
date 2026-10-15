# Plan: aprobación manual de reservas ("solicitud de reserva")

Rama `feat/aprobacion-reservas`. Nada se aplica a producción desde aquí.

## Modelo

- Configuración **por cabaña** (`cabana`): `requiere_aprobacion` (default `false`),
  `horas_respuesta_aprobacion` (default 24) y `horas_para_pagar` (default 24). Todas las cabañas
  existentes quedan apagadas: el flujo actual no cambia.
- Estados nuevos en el enum `estado_reserva` (un solo lugar en TypeScript: `lib/estados-reserva.ts`):
  `pendiente_aprobacion` → `aprobada_pendiente_pago` → `confirmada`, más `rechazada` y `expirada`.
  Los existentes (`pendiente_pago`, `cancelada`, ...) siguen igual: una `pendiente_pago` vencida sigue
  pasando a `cancelada`.
- Plazos: se reutiliza `reserva.expira_en` (en `pendiente_aprobacion` = plazo del dueño; en
  `aprobada_pendiente_pago` = vencimiento del link). Así la disponibilidad, el índice y el cron
  existentes sirven sin cambios de forma.
- Columnas nuevas en `reserva`: `aprobada_en`, `link_pago`, `link_pago_expira_en`,
  `whatsapp_abierto_en`, `recordatorio_dueno_en`, `recordatorio_huesped_en`, `expiracion_avisada_en`,
  `aviso_fallido`.
- `reserva_sin_traslape` se recrea para incluir `pendiente_aprobacion` y `aprobada_pendiente_pago`
  (la doble reserva la sigue impidiendo Postgres).
- RLS: `panel_admin` puede actualizar SOLO las 3 columnas de configuración de `cabana`, y solo en
  propiedades donde es `dueno`.

## Migraciones

1. `..._aprobacion_estados`: `ALTER TYPE ... ADD VALUE` (separada: Postgres no deja usar un valor de
   enum nuevo en la misma transacción en que se agrega).
2. `..._aprobacion_reservas`: columnas, restricción y RLS.
3. Reversa: `prisma/reversas/aprobacion_reservas.down.sql`.

## Archivos

- `lib/estados-reserva.ts`, `lib/disponibilidad.ts`, `lib/reservas.ts`, `lib/panel-bloqueos.ts`:
  estados que ocupan fechas y expiración.
- `lib/aprobacion.ts` (nuevo): reglas puras (WhatsApp, recordatorios) + aprobar, rechazar, renovar
  link, configurar cabaña, cron.
- `lib/notificaciones.ts` + `emails/aviso-solicitud.tsx` (nuevos): `notificarHuesped(canal,
  plantilla, datos)`, con reintentos y registro de fallas en `aviso_fallido`.
- `lib/mercadopago.ts`: link de pago con plazo propio; el pago de una aprobada usa el link guardado.
- Formulario del huésped, `/reserva/[codigo]`, panel (`/admin`, detalle, nueva `/admin/cabanas`),
  cron existente `/api/cron/expirar-reservas`.

## Riesgos

- Recrear `reserva_sin_traslape` en producción revalida las reservas existentes (tabla chica: rápido).
- Webhook: no se toca su lógica; ya confirma cualquier estado distinto de confirmada/completada.
  Se cubre con test.
- Correo del dueño a `propiedad.email` (el mismo de los avisos actuales).
