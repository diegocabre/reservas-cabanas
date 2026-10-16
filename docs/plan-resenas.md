# Reseñas (cabaña pública + huésped privado)

Rama `feat/resenas`, creada desde `feat/aprobacion-reservas`. **Nada se aplicó a producción**: la
migración, su reversa, el script de poblado y los tests de base corrieron en un Postgres 17 local
(Docker), igual que la aprobación. Todo queda **apagado por defecto**: las reseñas se activan **por propiedad** en `/admin/plataforma` (superadmin).

## Qué hace

| Etapa | Qué incluye | Se activa con |
|---|---|---|
| 1. Reseñas de la cabaña (públicas) | Invitación por correo al día siguiente del check-out, recordatorio a los 7 días, botón "Pedir reseña por WhatsApp" en el panel, formulario con link único (5 categorías de 1 a 5 estrellas + comentario), respuesta pública del dueño, reportes, cola de moderación del superadmin, sección pública con promedio, desglose y JSON-LD | Plataforma → Reseñas: "De la cabaña" |
| 2. Reseñas del huésped (privadas) | Identidad del huésped, reseña privada del dueño (recomendado / con reservas / no recomendado + etiquetas + comentario), recordatorio al dueño, historial en la tarjeta de cada solicitud y en el detalle, "Mis datos" (ver, replicar, pedir rectificación o eliminación), aviso de privacidad | Plataforma → Reseñas: "De la cabaña y del huésped" |
| 3. Doble ciego | Nada se muestra a la otra parte (ni al público) hasta que están las dos reseñas o pasan 14 días desde el check-out. Antes del desbloqueo el autor puede editar; después, no | Siempre que las reseñas estén encendidas (sin él nada se publicaría) |

Elegibilidad (ambos sentidos): reserva `confirmada` (o `completada`), check-out ya llegado, hasta 30
días después, una sola vez por reserva y por sentido (índice único), nunca en cabañas demo.

## Modelo

| Archivo | Contenido |
|---|---|
| `prisma/migrations/20261016120000_resenas` | Tablas `huesped`, `ciclo_resena` (token, envíos, desbloqueo), `resena_cabana`, `respuesta_resena`, `reporte_resena`, `resena_huesped`, `replica_huesped`, `solicitud_privacidad`, `configuracion_plataforma` (`compartir_reputacion = false`), `superadmin`; columna opcional `reserva.huesped_id`; checks (notas 1–5, largos, etiquetas válidas); RLS en todas; políticas para `panel_admin`; vista `reputacion_compartida`. No modifica ni borra datos existentes. |
| `prisma/reversas/resenas.down.sql` | Reversa (probada en local: vuelve exactamente a las 12 tablas anteriores). |
| `scripts/poblar-huespedes.ts` | `npm run huespedes:poblar` / `-- --revertir`. Idempotente; enlaza con SQL directo para no tocar `reserva.updated_at` (probado: el hash de las reservas queda igual antes, después y tras revertir). Se niega a correr contra Supabase sin `--permitir-supabase`. |

RLS (`panel_admin`):

- `resena_cabana`: solo lectura, solo de sus cabañas y **nunca retenidas** (doble ciego en la base). Sin `UPDATE` ni `DELETE`: el dueño no edita ni borra.
- `respuesta_resena` / `reporte_resena`: solo sobre reseñas publicadas de sus cabañas y a su propio nombre.
- `resena_huesped`: solo las de sus propiedades (aunque se encienda la reputación compartida); se edita solo mientras está `retenida`.
- `reputacion_compartida` (vista): calificación y etiquetas, **sin comentario**; las de otros dueños solo si `compartir_reputacion = true` (no hay interfaz para encenderlo).
- `superadmin`, `solicitud_privacidad`: sin permisos para el panel (las lee el servidor tras verificar al superadmin).
- La parte pública lee solo `resenasPublicas()`: `estado = 'publicada'` y únicamente nombre de pila, notas, comentario, fecha y respuesta.

## Archivos

- `lib/resenas-reglas.ts` (puro, con tests): elegibilidad, plazos, doble ciego, tokens HMAC, saneamiento de texto, nombre de pila, normalización de email/teléfono, promedios, JSON-LD, historial, mensaje de WhatsApp, etapas por propiedad.
- `lib/resenas.ts`: huésped y ciclo, `evaluarDesbloqueo` (con `FOR UPDATE`), envío del huésped por token, respuestas, reportes, WhatsApp, reseña del huésped, historial, "Mis datos", moderación y `procesarResenas` (cron).
- `lib/notificaciones.ts` + `emails/aviso-solicitud.tsx`: plantillas `invitacion_resena`, `recordatorio_resena`, `resena_huesped_pendiente` (dueño) y `enviarLinkAccesoHuesped`, por la misma capa `notificarHuesped(canal, plantilla, datos)`. WhatsApp automático sigue como etapa futura.
- `app/api/cron/resenas` + `vercel.json` (diario, 13:00 UTC ≈ 10:00 Chile).
- Huésped: `app/resena/[token]`, `app/mis-datos`, `app/mis-datos/[token]`, `components/aviso-privacidad.tsx` (también en `/reservar`, solo con reseñas encendidas).
- Público: `components/cabana/resenas.tsx` en la página de la cabaña (server-side, "ver más" con `<details>`) y `<script type="application/ld+json">` solo con reseñas publicadas.
- Panel: `/admin/resenas` (estadías recientes con "Pedir reseña por WhatsApp", reseñas con responder y reportar), `/admin/resenas/whatsapp/[codigo]` (registra `whatsapp_abierto_en` y redirige a wa.me), bloque de reseña e historial en `/admin/reservas/[codigo]`, historial en la tarjeta de solicitud del resumen, `/admin/moderacion` (solo superadmin, 404 para el resto).

## Tests

- `lib/resenas-reglas.test.ts` (puros): elegibilidad y plazos, invitación/recordatorio, doble ciego (ambas o 14 días), tokens, saneamiento XSS, nombre de pila, normalización de email y teléfono, promedios, JSON-LD (null sin reseñas, valores, `</script>` escapado), historial.
- `tests/db/resenas.test.ts` (Postgres): elegibilidad, único por reserva y sentido, token de un solo uso / manipulado / vencido, doble ciego con RLS y sin edición tras el desbloqueo, desbloqueo a los 14 días, RLS entre dueños con `compartir_reputacion` apagado y encendido, el dueño no responde ni reporta cabañas ajenas, el dueño no borra ni edita, reporte → cola → oculta (no se muestra, se conserva), página pública solo publicadas y sin datos personales, plazo de la respuesta, crons idempotentes, "Mis datos" (réplica, solicitud, vencimiento, límite).
- Los flujos existentes (reserva, aprobación, pago, bloqueos, accesos) siguen pasando: 268 tests puros y 92 de base.

## Decisiones tomadas

1. **Rama:** `feat/aprobacion-reservas` existía (igual a `main` en ese momento); `feat/resenas` sale de ella, así que la conexión con las solicitudes no necesita comprobación aparte.
2. **Activación por propiedad** (`propiedad.resenas` = `apagadas` / `cabana` / `completas`, migración `20261016140000_plataforma_propiedad`), la cambia solo el superadmin en `/admin/plataforma`, sin redeploy. Reemplazó a la variable `RESENAS` del primer deploy. El doble ciego corre en ambos modos.
3. **Token "firmado":** HMAC-SHA256 con `RESENAS_SECRETO` sobre `id:versión`; se guarda solo su hash. Así el servidor puede volver a armar el link vigente (recordatorio, WhatsApp) sin guardarlo. **Un solo uso** = cada link sirve para un envío: al enviar sube la versión y se entrega un link nuevo, que solo sirve para editar mientras la reseña siga retenida (máximo 5 ediciones). El del correo deja de servir; la página lo explica.
4. **Rate limiting** sin infraestructura nueva: el token de un solo uso + tope de ediciones limitan los envíos de reseñas; "Mis datos" permite un link cada 10 minutos por huésped y responde igual exista o no el email.
5. **Invitación automática solo la primera semana** después del check-out: al activar, no les llega un correo a huéspedes de hace un mes (el dueño igual puede pedirla por WhatsApp dentro de los 30 días). El aviso al dueño sigue la misma ventana.
6. **`completada` cuenta como confirmada** para la elegibilidad (es una estadía confirmada que terminó). Las cabañas demo nunca se reseñan.
7. **Respuesta del dueño:** editable 14 días desde que la escribe; cualquier admin de la propiedad (igual que confirmar/aprobar).
8. **El dueño no sabe si el huésped ya escribió** mientras la reseña está retenida (RLS la oculta por completo): es lo más estricto del doble ciego.
9. **Identidad del huésped:** por email normalizado (único); el teléfono se guarda y se usa además para encontrar el historial. Reservas sin email válido (algunas manuales/Airbnb) quedan sin huésped y no reciben reseña del dueño.
10. **Superadmin:** tabla `superadmin` (se agrega con SQL, ver abajo) y entra por el login del panel, así que también debe ser admin de al menos una propiedad. La moderación solo oculta reportes y marca solicitudes de privacidad como atendidas; rectificar o eliminar se hace a mano.
11. **Las reseñas de la cabaña y sus acciones no van a la tabla de auditoría** (no se amplió el enum): las tablas nuevas ya guardan autor, fecha y resolución.
12. **JSON-LD:** `VacationRental` con `AggregateRating` y hasta 10 `Review`; Google suele no mostrar estrellas de reseñas propias de un negocio, pero el marcado es válido e indexable.
13. **Tope de 100 reseñas** por cabaña en la página (comentado como atajo en el código).
14. **Reseñas de reservas de prueba nunca son públicas:** si la reserva tiene `es_prueba` (antes: `[PRUEBA]` al inicio de `notas`; ver docs/endurecimiento.md, fase 5), su reseña se publica para el dueño (panel, con aviso) pero `resenasPublicas()` la excluye, así que no llega a la página ni al JSON-LD. Así el piloto se prueba en producción sin reseñas falsas. Ojo: las reservas creadas mientras el sitio está en modo prueba llevan esa marca, incluidas las reales.

## Variables de entorno nuevas

- `RESENAS_SECRETO` — 32+ caracteres aleatorios. Obligatoria al activar (sin ella el cron falla).
- El cron nuevo usa el `CRON_SECRET` existente.

## Probar en local / preview (sin tocar la reserva real del piloto)

1. Postgres local: `docker run -d --name resenas-pg -e POSTGRES_PASSWORD=local -p 54329:5432 postgres:17`.
2. `.env.development.local` (ignorado por git, tiene prioridad sobre `.env`) con `DATABASE_URL` y `DIRECT_URL` locales, `RESENAS_SECRETO=...` (y `update propiedad set resenas = 'completas'` en la base local), `RESEND_API_KEY=` vacío.
3. `npx prisma migrate deploy`, `npx prisma db seed`, `npm run huespedes:poblar` (con esas variables exportadas en la terminal).
4. `npm test` y `npm run test:db` con `DATABASE_URL` local exportada (¡nunca con la de `.env`!).
5. En una rama de Supabase / preview de Vercel: misma secuencia con su URL; crear reservas de prueba propias con check-out pasado. No usar la reserva real del piloto.

## Orden recomendado para producción

1. Respaldo de la base.
2. Migración `20261016120000_resenas` (`npx prisma migrate deploy` con `DIRECT_URL` de producción). Reversa: `prisma/reversas/resenas.down.sql`.
3. Poblado: `npm run huespedes:poblar -- --permitir-supabase` (reversible con `--revertir`).
4. Deploy del código: no cambia nada visible (todas las propiedades quedan con reseñas apagadas). Configurar `RESENAS_SECRETO` en Vercel.
5. Superadmin: `insert into superadmin (usuario_id, email) values ('<id de auth.users>', '<email>');`
6. Etapa 1: en `/admin/plataforma`, Reseñas → "De la cabaña" en la propiedad (sin redeploy).
7. Etapas 2 y 3: Reseñas → "De la cabaña y del huésped" (el doble ciego ya corre desde la etapa 1).

## Pendiente

- Verificación visual del panel (`/admin/resenas`, detalle, moderación): requiere iniciar sesión con Supabase Auth, que en local apunta al proyecto de producción. Está cubierto por tipos y tests de base, no por capturas. Las páginas públicas (`/[propiedad]/[cabana]`, `/resena/[token]`, `/mis-datos/[token]`) sí se revisaron en escritorio y móvil.
- Interfaz para encender `compartir_reputacion` (fuera de alcance a propósito).
- WhatsApp automático (API de Meta): etapa futura; hoy el WhatsApp es el botón wa.me del dueño.
- Enviar correo al huésped cuando el superadmin atiende su solicitud (hoy se responde a mano).
- El aviso de `pg` "client.query() when the client is already executing a query" aparece una vez en los tests: viene del adaptador de Prisma al leer relaciones dentro de una transacción; no afecta resultados.

## Textos que requieren revisión legal (Ley 21.719)

- `components/aviso-privacidad.tsx`: aviso en el formulario de reserva y en las páginas de reseñas.
- `app/mis-datos/[token]/page.tsx`: texto sobre conservación por obligaciones legales; falta el responsable del tratamiento y los plazos de respuesta.
- Correo del link de acceso (`enviarLinkAccesoHuesped` en `lib/notificaciones.ts`) y la instrucción al dueño sobre el contenido de la reseña privada (`resena-huesped.tsx`).
