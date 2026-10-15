# Aprobación manual de reservas ("solicitud de reserva")

Rama `feat/aprobacion-reservas`. Nada se aplicó a producción: las migraciones se probaron en un
Postgres 17 local (Docker), igual que los tests contra la base.

## Qué hace

Interruptor **por cabaña** en `/admin/cabanas` ("Aprobar reservas manualmente"), con dos plazos por
cabaña: horas para que el dueño responda (24) y horas de vigencia del link de pago (24).

- **Apagado (default, todas las cabañas existentes):** igual que hoy: `pendiente_pago` → pago → `confirmada`.
- **Encendido:** la reserva web nace como `pendiente_aprobacion` (sin cobro, fechas retenidas).
  El dueño aprueba → `aprobada_pendiente_pago` con link de Mercado Pago creado en ese momento →
  el webhook existente la pasa a `confirmada`. También: `rechazada`, `expirada`, `cancelada`.

Cambiar el interruptor solo afecta reservas nuevas. Si se apaga con solicitudes vigentes, siguen su
flujo y el panel lo avisa (resumen y `/admin/cabanas`).

## Modelo (migraciones)

| Migración | Contenido |
|---|---|
| `20261015120000_aprobacion_estados` | Valores nuevos de `estado_reserva` y `accion_auditoria` (separada: Postgres no deja usar un valor de enum en la misma transacción en que se agrega). |
| `20261015120100_aprobacion_reservas` | `cabana`: `requiere_aprobacion`, `horas_respuesta_aprobacion`, `horas_para_pagar` (check 1–168). `reserva`: `aprobada_en`, `link_pago`, `link_pago_expira_en`, `whatsapp_abierto_en`, `recordatorio_dueno_en`, `recordatorio_huesped_en`, `expiracion_avisada_en`, `aviso_fallido`. `reserva_sin_traslape` recreada con los 2 estados nuevos que retienen fechas. RLS: `panel_admin` puede actualizar SOLO esas 3 columnas de `cabana` y solo como `dueno`. |
| Reversa | `prisma/reversas/aprobacion_reservas.down.sql` (probada en local). |

Plazos: se reutiliza `reserva.expira_en` (plazo del dueño en `pendiente_aprobacion`, vencimiento del
link en `aprobada_pendiente_pago`), así la disponibilidad y el índice existentes sirven tal cual.

## Archivos

- Estados en un solo lugar: enum de Prisma + `lib/estados-reserva.ts` (`ESTADOS_QUE_OCUPAN`,
  `ESTADOS_CON_PLAZO`, nombres). `lib/disponibilidad.ts` (`reservaOcupa`, `plazoVencido`),
  `lib/reservas.ts`, `lib/panel-bloqueos.ts` los usan.
- `lib/solicitudes.ts`: reglas puras (botón de WhatsApp, recordatorios, motivo).
- `lib/aprobacion.ts`: aprobar, rechazar, renovar link, registrar WhatsApp abierto, configurar
  cabaña, avisos y `procesarSolicitudes` (cron).
- `lib/notificaciones.ts` + `emails/aviso-solicitud.tsx`: `notificarHuesped(canal, plantilla, datos)`
  y `notificarDueno`, con 3 intentos; las fallas quedan en `reserva.aviso_fallido` y se muestran en el panel.
- `lib/mercadopago.ts`: `crearLinkPagoSolicitud` (misma preferencia, otro vencimiento); el botón de
  pago de una aprobada redirige al link guardado; un pago a una `rechazada` queda `[REVISAR PAGO]`.
- Cron existente `/api/cron/expirar-reservas` (Vercel, cada 30 min) llama a `procesarSolicitudes`.
- UI huésped: formulario ("Solicitar reserva", mensaje para el anfitrión, Teléfono / WhatsApp) y
  `/reserva/[codigo]` con los estados nuevos.
- UI panel: "Solicitudes pendientes" y "Esperando pago" en `/admin`; bloques en el detalle con
  Aprobar / Rechazar, Enviar por WhatsApp, Reenviar correo, Generar nuevo link; `/admin/cabanas`.

## Tests

- `lib/solicitudes.test.ts`, `lib/notificaciones.test.ts` (puros): teléfonos chilenos, wa.me con
  tildes/ñ/signos, botón deshabilitado sin teléfono o con link vencido, recordatorios, plantillas.
- `tests/db/solicitudes.test.ts` (Postgres, Mercado Pago simulado): interruptor apagado sin cambios,
  solicitud → aprobar → pago → confirmada, rechazo libera fechas, expiración por dueño y por pago
  (idempotente), recordatorios, renovar link, concurrencia, doble clic, permisos y RLS.

## Decisiones tomadas

1. **Teléfono:** ya era obligatorio y normalizado (`+569XXXXXXXX`) en el flujo actual; no se tocó la
   validación para no alterar ese flujo. Con aprobación activa solo cambia la etiqueta ("Teléfono / WhatsApp").
2. **Mensaje del huésped:** se reutiliza el campo "Comentarios" (`reserva.notas`); con aprobación
   activa se llama "Mensaje para el anfitrión". Sin columna nueva.
3. **Mensaje de WhatsApp:** no hay nombre del dueño en la base, así que dice "te escribo de {cabaña}"
   en vez de "soy {nombre_dueño}".
4. **Aprobar/rechazar:** cualquier admin de la propiedad (igual que confirmar/cancelar hoy). El
   **interruptor** solo lo cambia el rol `dueno` (código + RLS).
5. **Cabaña demo:** no se puede aprobar (no cobra nunca, ni en modo prueba).
6. **Pago que llega a una solicitud rechazada:** no confirma; queda `[REVISAR PAGO]`. A una
   cancelada o expirada se mantiene la regla actual (se reactiva si las fechas siguen libres).
7. **Cancelar una aprobada** no anula la preferencia en Mercado Pago (vence sola); si el huésped
   igual paga, rige la regla actual de pagos tardíos.
8. **Recordatorio al huésped:** se omite si el link dura 6 h o menos (el correo de aprobación es reciente).
9. **Correo:** Resend (el que ya usa el proyecto). Sin `RESEND_API_KEY` el aviso queda como fallido
   en el panel.
10. **Variables de entorno nuevas:** ninguna. El cron sigue usando `CRON_SECRET`.
