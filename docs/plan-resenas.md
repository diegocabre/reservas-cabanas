# Reseñas (cabaña pública + huésped privado)

Rama `feat/resenas`, creada desde `feat/aprobacion-reservas`. Nada se aplicó a producción: las
migraciones y los tests de base corren en un Postgres 17 local (Docker), igual que la aprobación.

## Plan (escrito antes de implementar)

Lo que ya existe y se reutiliza:

- Next 16 App Router, Prisma 7 + Postgres de Supabase, RLS con el rol `panel_admin` (`comoAdmin`).
- Panel `/admin` con `requerirAdmin()`, acciones con `ejecutar()` (transacción + RLS + mensaje).
- Correo: Resend detrás de `notificarHuesped(canal, plantilla, datos)` / `notificarDueno` (`lib/notificaciones.ts`).
- Cron: Vercel Cron con `CRON_SECRET` (`/api/cron/expirar-reservas`, cada 30 min).
- WhatsApp: `enlaceWhatsapp()` (wa.me) y el patrón `*_abierto_en` de la aprobación.
- Página pública de la cabaña: Server Component con ISR (`revalidate = 300`).

Modelo (una migración + su reversa):

- `huesped`: identidad normalizada (email en minúsculas sin espacios, teléfono `+569XXXXXXXX`,
  nombre de pila) + `reserva.huesped_id` opcional. Se llena con un script aparte y reversible
  (`scripts/poblar-huespedes.ts`) y, para reservas nuevas, cuando el cron de reseñas procesa el check-out.
- `ciclo_resena`: una fila por reserva elegible: token de invitación (hash, versión, vencimiento),
  envíos (invitación, recordatorio, WhatsApp abierto, recordatorio al dueño) y el desbloqueo del doble ciego.
- `resena_cabana` (pública tras el desbloqueo), `respuesta_resena` (respuesta del dueño),
  `reporte_resena` (cola de moderación).
- `resena_huesped` (privada), `replica_huesped` (réplica del huésped), `solicitud_privacidad`.
- `configuracion_plataforma` (`compartir_reputacion = false`) y `superadmin`.
- RLS: políticas para `panel_admin` en cada tabla nueva; vista `reputacion_compartida` (solo
  resumen, sin comentario) que solo muestra reseñas de otros dueños si el interruptor está encendido.

Etapas: 1) reseñas de cabaña (invitación, formulario por token, respuesta, reportes, moderación,
página pública + JSON-LD); 2) reseñas del huésped (identidad, formulario del dueño, historial en
solicitudes y detalle, derechos del huésped); 3) doble ciego (desbloqueo por ambas reseñas o 14 días).
Todo detrás de `RESENAS` (apagado por defecto) para activar por etapas sin redeploy de código.
