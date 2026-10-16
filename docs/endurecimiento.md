# Endurecimiento y estabilidad

Rama `fix/endurecimiento`, creada desde `main` (rama de producción: `5d0762d merge feat/plataforma`). Basado en `docs/diagnostico.md`. Nada de esto está desplegado ni migrado en producción.

## Línea base (15 oct 2026, antes de cualquier cambio)

| Verificación | Resultado |
| --- | --- |
| `npm test` | 24 archivos, 268 tests, todo en verde |
| `npm run lint` | sin errores |
| `npm run build` | en verde (Next 16.3.6) |
| `npm audit` | 10 altas, 0 críticas |

Detalle de `npm audit` (dependencias de producción: `next`, `prisma`, `@prisma/config`, `mysql2`, `deepmerge-ts`):

- `next` 16.0.0–16.3.7: envenenamiento de caché SSG/ISR (GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p), SSRF en optimización de imágenes (GHSA-cjq9-62q9-8jv4), fuga de Draft Mode con `use cache`, fuga en rutas de imágenes de metadata, fuga en el endpoint MCP del servidor de desarrollo. Arreglo: `next@16.4.2`.
- `mysql2` ≤3.23.0 y `deepmerge-ts` <8.0.0, vía `prisma`/`@prisma/config` 7.10.0. Arreglo: `prisma@7.10.1`. (La app usa Postgres; `mysql2` solo viene dentro del CLI de Prisma.)
- El resto son las mismas, contadas también vía `eslint-config-next`.

Red de seguridad antes de tocar pagos: `lib/mercadopago.test.ts`, 27 tests de caracterización de `registrarPagoMercadoPago` (confirmada, rechazada, bloqueada, traslape, pago duplicado, monto o moneda incorrectos, cuenta distinta, propiedad sin cuenta, modo prueba, pendiente/rechazado, error de base, aviso repetido). Simulan la API de Mercado Pago, la base y los correos; ningún cobro real. Pasan contra el código sin modificar.

## Fase 1: dependencias

- `next` 16.3.6 → **16.3.8**, no 16.4.2: 16.3.8 (30 sep 2026) es el parche de seguridad de la misma versión menor y corrige todas las alertas de `npm audit` sobre Next (notas de la versión: solo correcciones de seguridad). 16.4.2 salió el mismo 15 de octubre y es una versión menor nueva: no hacía falta.
- `prisma`, `@prisma/client` y `@prisma/adapter-pg` 7.10.0 → **7.10.1** (los tres juntos). Solo sube `mysql2` (3.24.4) y `deepmerge-ts` (8.0.2); no tiene notas de versión en GitHub. Se publicó el 15 de octubre: es un parche de dependencias, pero es nuevo; si algo raro aparece en preview, volver a 7.10.0 (`git revert` del commit).
- **Lockfile:** `npm install` (npm 11.6) borraba del `package-lock.json` los binarios opcionales de otras plataformas (rolldown, lightningcss; npm/cli#4828), lo que rompería el build en Vercel (Linux). Se editó el lockfile solo en las entradas de los paquetes actualizados y se verificó con `npm ci`.
- `images.remotePatterns`: ya estaba restringido a `https://images.unsplash.com/photo-*`, que usan las fotos de las cabañas demo del seed. Se deja igual.
- Páginas con `revalidate`/`generateStaticParams` (`/`, `/[propiedad]`, `/[propiedad]/[cabana]`): el build las genera igual que antes.
- `npm run verify` = tests + lint + build + `npm audit --omit=dev`. Producción: 0 vulnerabilidades.
- Pospuesto: `braces` (alta, vía `@next/eslint-plugin-next`, solo desarrollo, sin versión corregida publicada). No llega a producción. Revisar el 1 de noviembre de 2026.

## Fase 2: abuso en rutas públicas

Tabla `intentos_publicos` (migración `20261017120000_intentos_publicos`, reversa `prisma/reversas/intentos_publicos.down.sql`, probada en local): acción, clave y fecha. La clave es un HMAC-SHA256 con `LIMITES_SECRETO` de la IP, el email, el teléfono, el código o el token: nunca en claro. El cron `expirar-reservas` (cada 30 min) borra los de más de 48 horas.

**IP real** (`ipDeLaSolicitud`): `x-vercel-forwarded-for` (lo pone Vercel; el cliente no puede falsearlo), luego el primer valor de `x-forwarded-for`, luego `x-real-ip`; sin ninguno (local), `"desconocida"`.

**Si la base falla o la tabla no existe** (código desplegado antes que la migración), los límites dejan pasar y registran `limites_error`: nunca bloquean a un huésped por un error nuestro.

| Dónde | Límite (por defecto) | Al superarlo |
| --- | --- | --- |
| Reservar (`crearReserva`) | señuelo + marca firmada (mín. 3 s, máx. 24 h); 10 reservas por IP por hora (solo cuentan las que pasan la validación); 2 pendientes por email y 2 por teléfono en la misma cabaña; máx. 30 noches | mensaje amable; lo escrito se conserva |
| Correos de acciones públicas (reserva apartada, solicitud recibida, link de "Mis datos") | 3 por destinatario por día | no se envía ese correo (la reserva igual se crea; el dueño igual recibe el aviso de solicitud). Log `correo_sobre_tope` |
| `/mi-reserva` | señuelo; 30 búsquedas por IP por hora; 10 búsquedas fallidas por código por hora | mensaje amable; un bot recibe "no encontramos" |
| `/reserva/[codigo]` | 20 "no encontradas" por IP por hora; 30 verificaciones de `payment_id` por IP por hora; 30 clics en "Pagar" por IP por hora | página no encontrada; la verificación la sigue haciendo el webhook; error de pago genérico |
| Reseña (`/resena/[token]`) | señuelo; 30 envíos por IP y por token por hora | mensaje amable |
| `/mis-datos` | señuelo; 10 pedidos de link por IP por hora (y el mínimo existente de 10 min por huésped); 30 réplicas o solicitudes por IP y por token por hora | mensaje amable; un bot recibe la respuesta de siempre sin envío |
| Login del panel | señuelo; 10 pedidos de link por IP por hora (además del límite de Supabase) | mensaje amable |

No se limitó el reporte de reseñas: es una acción del panel, con sesión de admin.

**Retención de fechas (revisado, sin cambios):** una `pendiente_pago` retiene 30 minutos; una solicitud, las horas que configuró el dueño (`horas_respuesta_aprobacion`), y una aprobada, `horas_para_pagar`. Al vencer dejan de ocupar aunque el cron no corra (la disponibilidad las ignora y `crearReservaWeb` las expira antes de insertar). El cron es idempotente: `expirarReservasVencidas` solo cambia filas vencidas en estado pendiente, y cada aviso se marca en su columna solo si estaba en null.

Tests: `lib/limites.test.ts`, `lib/anti-bot.test.ts`, `app/reservar/[propiedad]/[cabana]/acciones.test.ts` (huésped legítimo, aprobación encendida y apagada, tope de correos, bot, límite por IP) y `tests/db/limites.test.ts` (contra la base local: pendientes por email y teléfono, vencidas y confirmadas no cuentan, noches máximas, ventana y limpieza). En el navegador (local, cabaña demo, escritorio y móvil): una reserva normal llega a la confirmación; con el señuelo lleno aparece el mensaje genérico y lo escrito se conserva.

### Regla de rate limit en el firewall de Vercel (segunda capa, a mano)

1. Vercel → proyecto → **Firewall** → **Configure** → **New Rule**.
2. Nombre: `Límite rutas públicas`.
3. Condición **If**: `Request Path` **starts with** `/reservar/` · **OR** · `Request Path` **equals** `/mi-reserva` · **OR** · `Request Path` **starts with** `/reserva/` · **OR** · `Request Path` **starts with** `/resena/` · **OR** · `Request Path` **starts with** `/mis-datos` · **OR** · `Request Path` **equals** `/admin/login`. Agregar `Method` **equals** `POST` para no contar las visitas normales a las páginas (las Server Actions son POST a la misma ruta).
4. **Then**: **Rate Limit**, algoritmo *Fixed Window*, **60 segundos**, **20 solicitudes**, clave **IP**. Acción al superar: **Deny** (429) o **Challenge**.
5. Guardar, dejar en **Log** un par de días para ver que ningún huésped real aparece, y después **Publish**.
6. No incluir `/api/webhooks/mercadopago` ni `/api/cron/*`: Mercado Pago y Vercel Cron llaman desde IPs compartidas.

## Fase 3: cabeceras de seguridad

`lib/cabeceras.ts`, aplicado en `next.config.ts` (`headers()`):

- **Todas las rutas:** `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=15552000` (6 meses, sin `includeSubDomains` ni `preload`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()` (la app no usa ninguno; el pago es una redirección a Mercado Pago, no la Payment Request API).
- **`/admin/*`, `/mis-datos/*`, `/resena/*` y `/reserva/*`:** `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. Se sumó `/reserva/[codigo]` porque el código funciona como token: quien lo tiene ve la reserva.
- **Sin restricción de iframes** en la portada, la propiedad, la cabaña y `/reservar`: no hay evidencia en el repo de que se incrusten, pero tampoco de que no (decisión: dejarlas sin `frame-ancestors`).
- **CSP propuesta solo en `Content-Security-Policy-Report-Only`** (no bloquea nada). Para evaluarla: abrir en preview las páginas públicas, la reserva, el pago con Mercado Pago, el panel y el login con DevTools → Consola; cada violación aparece como `[Report Only]`. Si después de unos días no aparece nada que importe, se puede pasar a `Content-Security-Policy` (ojo: `script-src 'unsafe-inline'` sigue siendo necesario mientras no se usen nonces). Con un build de producción local no apareció ninguna violación en la cabaña ni en la reserva.

Verificación (`curl -I`, build de producción local con la base local): las globales en todas las rutas; las privadas con `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `no-referrer` y `Cache-Control: no-store`; la cabaña mantiene su caché (`s-maxage=300`). En `next dev`, Next reemplaza `Cache-Control`; en producción se respeta. `/mis-datos` (estática) deja de guardarse en la CDN: es una página liviana.

Pendiente manual: probar en preview un pago completo con Mercado Pago (modo prueba) con estas cabeceras.
