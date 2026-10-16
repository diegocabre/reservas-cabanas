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

## Fase 4: pagos y webhook

**Estructura (sin cambio de comportamiento):** la decisión de en qué queda la reserva se extrajo a `decidirEstadoPago` (función pura, `lib/pagos.ts`); `registrarPagoMercadoPago` quedó como la capa que consulta la API, escribe en la base y envía correos. Los 27 tests de caracterización (`lib/mercadopago.test.ts`) pasan sin modificarse, antes y después.

**Webhook (`MERCADOPAGO_WEBHOOK_STRICT`, por defecto `false`):**

| Firma | `false` (por defecto) | `true`, fuera del modo prueba |
| --- | --- | --- |
| Válida | procesa | procesa |
| Sin `MERCADOPAGO_WEBHOOK_SECRET` | procesa + log `webhook_firma_invalida` (`motivo: sin_secreto`) | 401 |
| Con secreto, sin firma o inválida | 401 + log (igual que antes) | 401 + log |
| `user_id` que no es una cuenta conectada guardada | igual que antes (se consulta con el token de la plataforma) | 200 ignorado + log `webhook_vendedor_desconocido` |

Decisión: el prompt pedía que con `false` "si la firma no valida, registra un log y procesa igual que hoy". Hoy, con el secreto configurado, una firma inválida ya se rechaza con 401; se mantuvo así (lo más seguro y lo que el código hace hoy). Solo el caso "sin secreto" se procesa con log. La comparación de firma sigue en tiempo constante (`firmaValida`). La validación del `user_id` quedó dentro del modo estricto: en modo prueba los avisos de la cuenta de la plataforma traen el `user_id` de la plataforma, que no está en `cuenta_mercadopago`, y se habrían ignorado.

**Cuenta que cobra (`MERCADOPAGO_COBRO_ESTRICTO`, por defecto `false`):**

¿Puede una propiedad cobrar sin cuenta conectada fuera del modo prueba? Revisando el código: no se puede **crear** un cobro (`elegirCredencial` no entrega credencial sin cuenta fuera del modo prueba; `bloqueoReserva` rechaza la reserva web; las solicitudes aprobadas crean su link con la misma `crearPreferencia`). Pero sí puede **llegar** un pago aprobado a una propiedad sin cuenta: (a) un link de pago de una solicitud creado cuando la cuenta estaba conectada y pagado después de que el dueño la desconectó; (b) un pago armado a mano con `external_reference` igual al código, cobrado por otra cuenta conectada (otro dueño) y avisado con su `user_id`. Con la regla anterior (`cobroDeLaCuentaEsperada` devuelve `true` sin cuenta) esos pagos confirman la reserva. Para revisar producción (solo lectura): `select p.slug, c.mp_user_id from propiedad p left join cuenta_mercadopago c on c.propiedad_id = p.id;`.

Regla nueva (`verificarCuentaCobro`, con `true`): con cuenta conectada, el `collector_id` debe ser esa cuenta; sin cuenta conectada, solo un pago consultado con el token de la plataforma y solo en modo prueba. Un pago **aprobado** que no cumple **no se descarta**: no se registra como pago de la reserva ni la confirma, queda `[REVISAR PAGO] pago N cobrado por otra cuenta de Mercado Pago: revisar` y se envía un correo a los superadmins (tabla `superadmin`), una sola vez por pago. Un pago no aprobado que no cumple se ignora. Con `false` todo sigue como antes. Decisión: "cobro de la cuenta de la plataforma" se comprueba como "el pago se pudo consultar con el token de la plataforma" (la API solo devuelve pagos de esa cuenta); no se agregó una variable con el id de la plataforma.

**Idempotencia:** el mismo aviso dos veces no duplica el pago (upsert por `proveedor` + `ref_externa`), no cambia de nuevo el estado ni reenvía el correo de confirmación (test "el mismo aviso dos veces" en `lib/mercadopago.test.ts`); en el modo estricto, la marca de revisión y el correo al superadmin tampoco se repiten (`lib/mercadopago-cobro.test.ts`).

Tests: `lib/pagos.test.ts` (matriz completa: cuenta conectada o no × modo prueba o no × cuenta que coincide o no × origen de la consulta × interruptor), `app/api/webhooks/mercadopago/route.test.ts` (los dos modos), `lib/mercadopago-cobro.test.ts`.

Logs estructurados nuevos (JSON, sin tokens ni datos personales): `webhook_firma_invalida`, `webhook_vendedor_desconocido`, `webhook_pago`, `pago_otra_cuenta`, `correo_superadmin_fallido`.

## Fase 5: estados fuera de `notas`

Migración `20261017130000_estados_fuera_de_notas` (reversa `prisma/reversas/estados_fuera_de_notas.down.sql`, probada en local): `es_prueba boolean not null default false`, `revisar_pago boolean not null default false`, `revisar_pago_motivo text`. Solo agrega columnas: no toca `notas` ni ninguna fila. `reserva` ya tiene RLS y `panel_admin` tiene permisos sobre la tabla completa; no se tocó ninguna migración de RLS.

Lecturas y escrituras reemplazadas (ninguna lee ya marcas en `notas`):

| Antes (`notas`) | Ahora |
| --- | --- |
| `crearReservaWeb` anteponía `[PRUEBA]` | `es_prueba = enModoPrueba()`; `notas` = lo que escribió el huésped |
| `registrarPagoMercadoPago` agregaba líneas `[REVISAR PAGO] …` | `revisar_pago = true` y el motivo en `revisar_pago_motivo` (una línea por pago, sin repetir) |
| Panel: confirmar o "marcar revisado" cambiaba a `[PAGO REVISADO]` | `revisar_pago = false`; el motivo se conserva y la acción queda en la auditoría |
| Panel: resumen, lista (filtro "revisar"), detalle y etiqueta "Revisar pago" | `revisar_pago` / `revisar_pago_motivo` |
| Correos ("[Prueba]" en el asunto), avisos de solicitudes, `/reserva/[codigo]` | `es_prueba` |
| Reseñas: las de reservas de prueba nunca son públicas | `es_prueba` |
| Mensaje del huésped en el panel y en los avisos (se le quitaba `[PRUEBA]`) | `notas` tal cual |

Tests: un huésped que escribe `[PRUEBA]` o `[REVISAR PAGO]` no cambia nada (`lib/panel.test.ts`, `tests/db/acciones-reserva.test.ts`, `tests/db/resenas.test.ts`, `tests/db/limites.test.ts`). En los tests de caracterización de pagos solo cambiaron las aserciones de **dónde** se guarda la marca de revisión; los resultados son los mismos.

**Datos existentes — decisión manual:** `npm run marcas:notas` (por defecto solo lista, no escribe; se puede correr contra producción) muestra cada reserva con `[PRUEBA]`, `[REVISAR PAGO]` o `[PAGO REVISADO]` en `notas`, con su fecha de creación, estado, origen y las líneas con marca. Con `--aplicar --prueba=COD1,COD2 --revisar=COD3` (y `--permitir-supabase` en producción) marca solo las columnas de esos códigos; `notas` nunca se toca.

**Ojo con el orden:** hasta que se corra ese poblado, las reservas antiguas con `[REVISAR PAGO]` pendiente **no aparecen** como "pago por revisar" en el panel, y las antiguas con `[PRUEBA]` se tratan como reales (sus reseñas podrían publicarse y sus correos ya no dicen "[Prueba]"). Por eso: migración → listar → decidir y aplicar → recién entonces desplegar el código.

Decisión: el detalle del panel ahora muestra `notas` tal cual; en reservas antiguas se verá el texto `[PRUEBA]` que ya estaba guardado.

## Fase 6: verificaciones de estabilidad

- **Cron:** los dos (`/api/cron/expirar-reservas`, `/api/cron/resenas`) ya exigían `Authorization: Bearer ${CRON_SECRET}` y rechazan si falta la variable (incluso `Bearer undefined`). Confirmado; se agregó `app/api/cron/cron.test.ts`. Ahora registran `cron_ejecutado` (solo conteos) o `cron_fallido` (y responden 500).
- **Código de reserva:** usaba `crypto.randomInt` (criptográfico), pero con 6 caracteres de 31 son ≈ 29,7 bits, menos de 40. **Corregido solo para reservas nuevas:** 8 caracteres (`LL-7K3QX9AB`, ≈ 39,6 bits). Los códigos existentes (6 caracteres y los antiguos `LL-0001`) siguen funcionando: escrito sin guion, `/mi-reserva` y el buscador del panel prueban los dos largos (`candidatosCodigo`). Decisión: 8 y no 9 caracteres, para que siga siendo fácil de dictar; junto con el límite de "no encontradas" por IP no se puede adivinar probando. Subirlo es cambiar `LARGO_CODIGO`.
- **Consultas públicas sin RLS:** inventario en `docs/consultas-publicas.md` y test en `tests/db/consultas-publicas.test.ts` (no devuelven datos de otras reservas ni datos personales).
- **Logs:** `lib/registro.ts` → `registrar(nivel, evento, datos)`: una línea JSON buscable por `evento`; los errores se reducen a su mensaje y se les quitan emails, teléfonos y tokens (`sanear`). Se pasaron a este formato todos los logs de pagos, webhook, cron, correos, avisos, límites y conexión de Mercado Pago.

Eventos (buscar en Vercel → Logs por el nombre):

| Evento | Nivel | Dónde |
| --- | --- | --- |
| `webhook_firma_invalida`, `webhook_vendedor_desconocido`, `webhook_pago` | warn / info | webhook |
| `pago_otra_cuenta`, `pago_inicio_fallido`, `pago_verificacion_fallida`, `correo_superadmin_fallido` | warn / error | pagos |
| `mercadopago_conexion_fallida`, `mercadopago_renovacion_fallida` | error | cuentas de Mercado Pago |
| `cron_ejecutado`, `cron_fallido`, `cron_limpieza_error` | info / error | cron |
| `correo_fallido` (con `correo`: tipo), `correo_sin_configurar`, `correo_sobre_tope`, `aviso_fallido`, `aviso_registro_fallido`, `aviso_huesped_error`, `aviso_dueno_error`, `login_link_fallido` | warn / error | correos y avisos |
| `limite_superado`, `limite_pendientes`, `antibot_rechazado`, `limites_error`, `limites_sin_secreto` | warn / error | límites |
