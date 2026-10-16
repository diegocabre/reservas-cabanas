# Endurecimiento y estabilidad

Rama `fix/endurecimiento`, creada desde `main` (rama de producción: `5d0762d merge feat/plataforma`). Basado en `docs/diagnostico.md`. Nada de esto está desplegado ni migrado en producción. Las migraciones y los tests de base se probaron solo en el Postgres local (Docker), nunca contra la base de `.env`.

## Estado de cada hallazgo del diagnóstico

| Hallazgo | Estado |
| --- | --- |
| Estados guardados en `notas` | **Confirmado y corregido** (fase 5). Falta decidir a mano las reservas antiguas (`npm run marcas:notas`). |
| `lib/resenas.ts` de 864 líneas | **Confirmado, pospuesto** (fase 7 opcional; ver "Pendiente"). |
| `registrarPagoMercadoPago` hace demasiado / decisión sin tests | **Confirmado y corregido** (fase 0: caracterización; fase 4: `decidirEstadoPago` pura). |
| Solo el panel tiene RLS como segunda defensa | **Confirmado; es diseño.** Documentado con test (`docs/consultas-publicas.md`). |
| Next 16.3.6 vulnerable | **Confirmado y corregido**: 16.3.8. |
| Prisma 7.10.0 con `mysql2`/`deepmerge-ts` vulnerables | **Confirmado y corregido**: 7.10.1. |
| Sin límites ni anti-bot en rutas públicas | **Confirmado y corregido** (fase 2). Segunda capa en el firewall de Vercel: paso manual. |
| Webhook acepta avisos sin firma si falta el secreto | **Confirmado; corregido detrás de interruptor** (`MERCADOPAGO_WEBHOOK_STRICT`, apagado por defecto). |
| `cobroDeLaCuentaEsperada` acepta cualquier cuenta sin cuenta conectada | **Confirmado** (alcanzable con un link de solicitud tras desconectar la cuenta, o un pago armado por otro dueño conectado); **corregido detrás de interruptor** (`MERCADOPAGO_COBRO_ESTRICTO`). |
| Sin cabeceras de seguridad | **Confirmado y corregido** (fase 3). |
| (Nuevo, fase 6) Código de reserva de ≈ 29,7 bits | **Confirmado y corregido** para reservas nuevas (8 caracteres). |
| (Nuevo, fase 6) Cron | **No reproducido**: ya exigían `CRON_SECRET`. Se agregaron tests y logs. |

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

## Fase 7 (opcional): dividir `lib/resenas.ts`, no se hizo

Todo lo anterior quedó en verde, pero se dejó fuera de esta rama a propósito: es un movimiento de ~860 líneas sin cambio de comportamiento y, mezclado con 15 commits que tocan pagos, haría más difícil revisar lo que sí cambia comportamiento antes de producción. Conviene hacerlo en su propia rama después de desplegar esta.

## Decisiones tomadas

1. `next` 16.3.8 (parche de la misma versión menor) en vez de 16.4.2 (fase 1).
2. Lockfile editado solo en las entradas actualizadas, por un bug de npm 11.6 que borraba los binarios de Linux (fase 1).
3. `images.remotePatterns` se deja igual: ya estaba restringido a lo que usan las cabañas demo (fase 1).
4. Si falta `LIMITES_SECRETO`, la sal se deriva de otro secreto del servidor (para no romper producción si se despliega antes de configurarla), con un aviso en el log (fase 2).
5. Los límites dejan pasar si la base falla o la tabla no existe (fase 2).
6. Noches máximas por defecto: 30 (configurable). Una estadía más larga se pide por WhatsApp (fase 2).
7. Marca anti-bot solo en el formulario de reservar (página dinámica); en `/mi-reserva`, `/mis-datos`, reseñas y login solo el señuelo, porque algunas son estáticas y la marca quedaría fija desde el build. Un envío en menos de 3 s se rechaza con "Recarga la página e intenta de nuevo"; al reintentar pasa (probado en el navegador) (fase 2).
8. El tope de correos (3 por destinatario por día) aplica solo a correos que dispara una acción pública; la confirmación de un pago aprobado y los avisos al dueño no se limitan (fase 2).
9. `/reserva/[codigo]` se trata como ruta con token: sin iframes, `no-referrer` y `no-store` (fase 3).
10. Las páginas públicas de la cabaña y de reservar no prohíben iframes (fase 3).
11. Con `MERCADOPAGO_WEBHOOK_STRICT=false`, una firma inválida con el secreto configurado se sigue rechazando con 401, como hoy; solo "sin secreto" se procesa con log (fase 4).
12. La validación del `user_id` del webhook va dentro del modo estricto: en modo prueba el `user_id` es el de la plataforma, que no es una cuenta conectada (fase 4).
13. La regla de cuenta de cobro tiene su propio interruptor (`MERCADOPAGO_COBRO_ESTRICTO`), que también aplica en modo prueba para poder probarla en preview. "Cuenta de la plataforma" significa que el pago se consultó con su token (fase 4).
14. Un pago aprobado de otra cuenta no se registra como pago de la reserva (no sumaría a "lo pagado"), pero deja la marca de revisión y avisa al superadmin (fase 4).
15. `notas` se muestra tal cual en el panel; en reservas antiguas se verá el texto `[PRUEBA]` que ya estaba guardado (fase 5).
16. Código de reserva de 8 caracteres (≈ 39,6 bits) y no 9, para que siga siendo fácil de dictar (fase 6).
17. Los tests de base anteriores reusan el mismo email y teléfono en muchas reservas: `vitest.db.config.mts` les sube `LIMITE_PENDIENTES_POR_CONTACTO`; `tests/db/limites.test.ts` prueba el valor por defecto (fase 2).

## Variables de entorno nuevas

Todas documentadas en `.env.example`. Ninguna es obligatoria para que la app funcione igual que hoy.

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `LIMITES_SECRETO` | derivada (con aviso) | Sal de los hashes de IP, email y teléfono, y firma de la marca anti-bot. **Definirla en Vercel** (32+ caracteres aleatorios). Si cambia, solo se reinician los contadores. |
| `LIMITE_PENDIENTES_POR_CONTACTO` | 2 | Pendientes por email y por teléfono en una cabaña |
| `LIMITE_RESERVAS_IP_HORA` | 10 | Reservas web por IP por hora |
| `LIMITE_CORREOS_DESTINO_DIA` | 3 | Correos por destinatario por día (acciones públicas) |
| `RESERVAS_MAX_NOCHES` | 30 | Noches máximas de una reserva web |
| `LIMITE_CONSULTAS_IP_HORA` | 30 | Búsquedas, reseñas, mis datos, pagar y verificar pago, por IP por hora |
| `LIMITE_BUSQUEDAS_CODIGO_HORA` | 10 | Búsquedas fallidas por código por hora |
| `LIMITE_NO_ENCONTRADAS_IP_HORA` | 20 | Páginas de reserva no encontradas por IP por hora |
| `LIMITE_LINKS_IP_HORA` | 10 | Pedidos de link (panel, mis datos) por IP por hora |
| `MERCADOPAGO_WEBHOOK_STRICT` | `false` | Webhook estricto (fase 4) |
| `MERCADOPAGO_COBRO_ESTRICTO` | `false` | Regla explícita de la cuenta de cobro (fase 4) |

## Pasos manuales (para ti)

1. **Respaldo manual de la base** de producción antes de aplicar migraciones (Supabase → Database → Backups, o `pg_dump` con `DIRECT_URL`).
2. **Vercel → Environment Variables:** confirmar que apuntan al proyecto de Supabase correcto (en octubre todavía apuntaban al antiguo); definir `LIMITES_SECRETO`; confirmar que `MERCADOPAGO_WEBHOOK_SECRET` está definida (Mercado Pago Developers → tu aplicación → Webhooks → clave secreta). Dejar `MERCADOPAGO_WEBHOOK_STRICT` y `MERCADOPAGO_COBRO_ESTRICTO` sin definir (o en `false`).
3. **Marcas antiguas:** correr `npm run marcas:notas` contra producción (solo lista). Decidir qué reservas eran de prueba y cuáles tienen un pago por revisar, y aplicarlo con `npm run marcas:notas -- --aplicar --prueba=... --revisar=... --permitir-supabase`.
4. **Preview:** probar un pago completo en modo de pruebas de Mercado Pago (solicitud, aprobación, pago y confirmación; y también una reserva directa), y revisar las cabeceras con `curl -I https://<preview>/reserva/<codigo>` y `curl -I https://<preview>/`.
5. **Firewall de Vercel:** crear la regla de la fase 2 (primero en modo Log).
6. **Webhook estricto:** revisar los logs `webhook_firma_invalida` durante unos días después del despliegue. Si no aparece ninguno legítimo, poner `MERCADOPAGO_WEBHOOK_STRICT=true` (y después `MERCADOPAGO_COBRO_ESTRICTO=true`) y volver a desplegar.
7. **Correo:** confirmar en el DNS del dominio de envío (`reservas.solucionesdys.cl`) que SPF, DKIM (los registros que entrega Resend) y DMARC (`_dmarc`, al menos `p=none` con `rua`) están configurados y verificados en Resend.

## Orden recomendado para producción

1. Respaldo de la base.
2. Migraciones (`npx prisma migrate deploy` con el `DIRECT_URL` de producción): `20261017120000_intentos_publicos` y `20261017130000_estados_fuera_de_notas`. Las dos solo agregan (una tabla y tres columnas con default): el código actual de `main` sigue funcionando con ellas.
3. Poblado manual de marcas (paso manual 3). **Hacerlo antes de desplegar el código**: si no, los pagos antiguos por revisar no aparecen en el panel y las reservas antiguas de prueba se tratan como reales.
4. Variables en Vercel (paso manual 2).
5. Desplegar la rama en preview y probar (paso manual 4).
6. Merge a `main` y despliegue a producción.
7. Regla del firewall (paso manual 5).
8. Unos días después: interruptores estrictos (paso manual 6).

## Notas de reversa

- **Código:** cada fase es un commit propio; `git revert` del commit (o de los de la fase) y volver a desplegar. Revertir el código **antes** de cualquier reversa de migración: el código nuevo usa las columnas y la tabla nuevas.
- **Interruptores:** `MERCADOPAGO_WEBHOOK_STRICT=false` y `MERCADOPAGO_COBRO_ESTRICTO=false` vuelven al comportamiento anterior sin tocar el código (solo hay que volver a desplegar con las variables).
- **Límites demasiado estrictos:** subir el umbral por variable de entorno, sin tocar código.
- **`intentos_publicos`:** `prisma/reversas/intentos_publicos.down.sql` y luego `delete from "_prisma_migrations" where migration_name = '20261017120000_intentos_publicos';`. Solo se pierden contadores.
- **Estados fuera de `notas`:** primero listar lo que quedó en las columnas (`select codigo, es_prueba, revisar_pago, revisar_pago_motivo from reserva where es_prueba or revisar_pago;`), volver al código anterior (que lee `notas`) y después correr `prisma/reversas/estados_fuera_de_notas.down.sql` y `delete from "_prisma_migrations" where migration_name = '20261017130000_estados_fuera_de_notas';`. Las marcas de revisión creadas después del despliegue habría que copiarlas a `notas` a mano.
- **Dependencias:** revertir por separado el commit de `next` o el de `prisma` (cada uno incluye su lockfile).

## Verificación final

- `npm run verify` (tests + lint + build + `npm audit --omit=dev`): en verde, con 422 tests y 0 vulnerabilidades de producción.
- `npm run test:db` contra el Postgres local: 109 tests en verde.
- Navegador (local, cabaña demo, escritorio y móvil): una reserva normal llega a la confirmación con código de 8 caracteres; el señuelo lleno y el envío instantáneo se rechazan con el mensaje genérico; el reintento de una persona se acepta; unas notas con `[REVISAR PAGO]` no activan nada; consola sin errores. El panel no se pudo revisar visualmente en local (el login usa el Supabase Auth de producción): está cubierto por tipos y tests de base.
- No verificado: un pago real con Mercado Pago en preview (requiere credenciales de prueba y https; es el paso manual 4).
