@AGENTS.md

# Reservas Cabañas Sur

Sistema de reservas para cabañas y hoteles boutique del sur de Chile (Puerto Varas, Frutillar, Ensenada). Proyecto de Soluciones DyS SpA, construido en público para Instagram entre el 28 de septiembre y el 26 de octubre de 2026.

Objetivo del MVP: que un huésped vea la disponibilidad, reserve, pague el abono online y reciba su confirmación, y que el dueño gestione todo desde un panel simple.

## Stack

- Next.js (App Router) + TypeScript estricto + Tailwind CSS
- Supabase: Postgres + Auth (link mágico por email)
- Prisma como ORM (conexión a Supabase con `DATABASE_URL` por pooler y `DIRECT_URL` para migraciones)
- Zod para validar formularios en cliente y servidor
- react-day-picker + date-fns (locale `es`) para el calendario
- Más adelante: Mercado Pago Checkout Pro, Resend + React Email, Vercel Cron (solo para expirar reservas no pagadas)
- Etapa 2, después del piloto (no instalar en el MVP): node-ical / ical-generator
- Deploy en Vercel

Usa las versiones estables actuales de cada librería y sigue su documentación oficial. No agregues dependencias fuera de esta lista sin preguntar.

## Reglas del dominio

- Interfaz en español de Chile. Formato de moneda `$120.000` (CLP, sin decimales). Zona horaria `America/Santiago`.
- Montos siempre como enteros en CLP. Nunca `float` ni `Decimal` para dinero.
- Fechas de estadía (`check_in`, `check_out`) como `date`, no `timestamp`. El día de `check_out` queda libre para otra llegada.
- Todos los rangos de fechas son semiabiertos `[desde, hasta)`: el último día es EXCLUSIVO. Aplica a `Reserva` (`check_in`, `check_out`), `Temporada` (`desde`, `hasta`) y `Bloqueo` (`desde`, `hasta`), igual que `DTEND` en iCal. Ej.: una temporada del 15 dic al 28 feb se guarda como `desde = 15-dic`, `hasta = 1-mar`. Siempre `hasta > desde`.
- Noches = `check_out - check_in`. Personas = adultos + niños. Precios fijos todo el año en la tabla `Tarifa` (por cabaña, por NOCHE, no por persona): se usa la fila cuyo tramo de personas incluye al grupo y con el mayor `noches_desde` que alcance, y ese precio se cobra en TODAS las noches (piloto: 4 personas, 3 noches = 3 × $60.000). Sin valores de precio en el código: viven en la tabla (cargados por el seed).
- Si no hay `Tarifa` para el grupo, el cálculo (`calcularPrecio` en `lib/precios.ts`) falla con un error claro que indica la cabaña, las personas y las noches. Nunca cobrar 0. Las temporadas (`Temporada`) ya no se usan en el cálculo; la tabla queda para la etapa 2.
- Estadía mínima = `cabana.min_noches` (piloto: 1, se aceptan estadías de 1 noche) y personas de 1 a `cabana.capacidad` (piloto: 8). Se valida en el navegador (calendario: "Estadía mínima: N noches") y en el servidor con la misma función `calcularPrecio`. El servidor siempre recalcula el total; nunca confía en el del navegador.
- Abono = `calcularAbono(total, precioNoche, regla)` en `lib/precios.ts`, con la regla de la propiedad de la cabaña: si `abono_noches` no es null, N noches al precio por noche de la estadía con tope en el total (en una estadía de 1 noche se paga todo y el saldo es 0); si es null, `abono_pct` del total redondeado al peso. Hoy todas las propiedades usan 50 % (Maicolpue: confirmado por el dueño el 9 oct 2026); `abono_noches` queda disponible pero sin usar. Saldo = total − abono, así abono + saldo = total siempre. La reserva guarda el abono calculado al crearla; Mercado Pago, el webhook, los emails y la página de la reserva usan ese valor y `saldoReserva()`.
- Datos marcados `PENDIENTE` (valores de ejemplo mientras el dueño los confirma) en ubicación, WhatsApp, email, instrucciones de llegada o política de cancelación: la propiedad no se publica ni cobra fuera del modo prueba (`bloqueoPublicacion` en `lib/publicacion.ts`). En modo prueba se puede probar con un aviso.
- Cabañas demo (`cabana.demo`): no existen, solo muestran el sistema. NUNCA cobran, ni en modo prueba (`bloqueoCobro` en `lib/publicacion.ts`: sin preferencia de Mercado Pago ni botón de pago). Fuera del modo prueba tampoco reciben reservas ni se listan en su propiedad (`bloqueoReserva`).
- Galerías con fotos y videos verticales en `public/piloto/<cabaña>/galeria/galeria.json`, registradas en `lib/galeria.ts`. El ítem 1 es la portada, la vista previa de WhatsApp (og:image) y la foto del email; el seed guarda las imágenes en orden en `cabana.fotos`.
- Estados de reserva: `pendiente_pago`, `confirmada`, `cancelada`, `completada`.
- Acciones del dueño en el panel (`lib/panel-acciones.ts`, reglas puras en `lib/estados-reserva.ts`): confirmar (desde `pendiente_pago` o `cancelada`; revisa bloqueos y la base rechaza traslapes), cancelar (desde `pendiente_pago` o `confirmada`, con motivo obligatorio; libera las fechas), registrar un pago recibido (`efectivo`, `transferencia` o `mercadopago`; lo pagado nunca supera el total) y marcar un `[REVISAR PAGO]` como revisado (queda `[PAGO REVISADO]`). Cada acción bloquea la fila (`FOR UPDATE`), revalida contra la base y escribe `Auditoria` (quién, cuándo, estado antes y después, detalle). El panel no borra reservas ni pagos, y la auditoría es solo de inserción.
- Una reserva web nace en `pendiente_pago` con `expira_en = ahora + 30 min` (`MINUTOS_PARA_PAGAR` en `lib/disponibilidad.ts`). Las pendientes vencidas ya no ocupan fechas y se marcan `cancelada` antes de insertar una nueva reserva en esa cabaña.
- Código de reserva: `prefijo_codigo` de la propiedad + 6 caracteres aleatorios sin caracteres confundibles (`LL-7K3QX9`, `lib/codigo.ts`), para que no se pueda adivinar. La unicidad la asegura el índice único de `codigo`; si choca, se reintenta con otro. Las primeras reservas de prueba conservan su código correlativo (`LL-0001`…); `ultimo_correlativo` quedó en desuso.
- Al crear una reserva web se envía el email "reserva apartada" con el link para pagar, por si el huésped cierra la página. `/mi-reserva` permite volver a la reserva con código Y email (los dos son obligatorios; mismo mensaje de error si falla cualquiera).
- En reservas web el RUT del huésped es obligatorio (validado con dígito verificador). En la base es opcional porque las reservas de Airbnb, Booking o manuales pueden no traerlo.
- La página `/reserva/[codigo]` no muestra email (solo oculto, `d***@gmail.com`), teléfono ni RUT: cualquiera que tenga el link puede verla.
- Pago del abono con Mercado Pago Checkout Pro (`lib/mercadopago.ts`, lógica pura en `lib/pagos.ts`): la preferencia usa `external_reference = codigo`, cobra el abono exacto en CLP y expira junto con la reserva. Un pago se aplica SOLO después de consultarlo a la API de Mercado Pago (webhook `/api/webhooks/mercadopago` y regreso a `/reserva/[codigo]`); nunca se confía en el aviso ni en los parámetros de la URL. Es idempotente (`Pago` es único por `proveedor` + `ref_externa`). Si el monto no coincide, o el pago llega cuando las fechas ya se tomaron, la reserva no se confirma y queda `[REVISAR PAGO]` en `notas`.
- Por ahora hay una sola cuenta de Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`). En producción con cabañas reales, cada propiedad debe cobrar en su propia cuenta: el dinero del huésped no debe pasar por Soluciones DyS.
- Modo prueba (`enModoPrueba()` en `lib/sitio.ts`): activado por defecto mientras no haya pago en línea. Muestra avisos de prueba en el botón de reserva, el formulario y la confirmación, y marca las reservas con `[PRUEBA]` en `notas`. Se desactiva con `RESERVAS_MODO_PRUEBA=false`.
- Origen de reserva: `web`, `airbnb`, `booking`, `manual`.
- Bloqueos del dueño (`/admin/bloqueos`, `lib/panel-bloqueos.ts`, reglas puras en `lib/bloqueos.ts`): el dueño elige primera y última noche (inclusive); se guarda `[desde, hasta)` con hasta = última + 1. Motivo: `airbnb`, `booking`, `mantencion`, `uso_personal`. No se crea si choca con una reserva confirmada o pendiente vigente (se muestran cuáles) ni con otro bloqueo. Se pueden eliminar los manuales; todo queda en la auditoría.
- Cerrojo por cabaña (`cerrojoCabana` en `lib/errores-db.ts`, `pg_advisory_xact_lock`): lo toman la reserva web, la confirmación del dueño y la creación de bloqueos antes de revisar disponibilidad, para que un bloqueo y una reserva simultáneos no pasen los dos. Todo código nuevo que revise disponibilidad y luego escriba debe tomarlo.
- Tema visual por propiedad (`propiedad.tema`, `lib/tema.ts`): colores propios que sobrescriben las variables de `app/globals.css` en las páginas de la propiedad, sus cabañas, reservar y la confirmación (`<TemaPropiedad>`). Null = paleta base. Todo tema debe pasar `problemasDeContraste` (WCAG AA 4,5:1); los errores usan `alerta`, no `fuego`, para seguir leyéndose como error. Ningún color fijo en los componentes públicos: siempre los tokens.
- La base es multi-propiedad desde el inicio: toda cabaña pertenece a una `Propiedad`. Un usuario puede administrar varias propiedades (una fila `Admin` por usuario y propiedad).
- Panel del dueño (`/admin`): login con link mágico de Supabase Auth, sin registro abierto (los admins se crean con `npm run admin:registrar`). `proxy.ts` (el middleware de Next 16) solo revisa la sesión; cada página y Server Action llama a `requerirAdmin()` (`lib/admin.ts`). Toda consulta del panel va por `lib/panel-datos.ts`, con dos defensas: filtra por las propiedades del admin (`deSusPropiedades`) y corre dentro de `comoAdmin()` (`lib/panel-acceso.ts`), que usa el rol `panel_admin` para que Postgres aplique RLS.
- RLS activado en todas las tablas; nuevas tablas también deben activarlo en su migración (`alter table "x" enable row level security;`). Toda lectura y escritura pasa por Prisma en el servidor, que se conecta como `postgres` (dueño de las tablas, con `BYPASSRLS`); la API pública de Supabase (`anon`, `authenticated`) no tiene acceso a nada y no tiene políticas. Incluye `_prisma_migrations`.
- Única excepción: el rol `panel_admin` (sin `BYPASSRLS`, solo `postgres` puede asumirlo) tiene políticas que limitan cada fila a las propiedades de `app.usuario_id` (migración `admin_por_propiedad_y_rls_panel`). Una tabla nueva que use el panel necesita su `grant` y su política para `panel_admin`, y un caso en `tests/db/`.

## Modelo de datos

Propiedad, Admin, Cabana, Tarifa, Temporada (sin uso), Reserva, Pago, Auditoria, Bloqueo, CalendarioExterno.

- **Propiedad**: nombre, slug único, tema (JSON, opcional), ubicacion, prefijo_codigo (único), ultimo_correlativo, whatsapp, email, abono_pct (default 50), abono_noches (opcional; si está, manda sobre abono_pct), politica_cancelacion, instrucciones_llegada
- **Admin**: usuario_id (= id de usuario de Supabase Auth), propiedad_id, email, rol (`dueno` | `staff`). Única por usuario + propiedad.
- **Cabana**: propiedad_id, nombre, slug (único por propiedad), capacidad, dormitorios, descripcion, servicios (text[]), fotos (text[]), min_noches, activa, demo (cabaña de demostración)
- **Tarifa**: cabana_id, personas_desde, personas_hasta (inclusivos), noches_desde, precio_noche (int). Única por cabaña + personas_desde + noches_desde.
- **Temporada** (sin uso desde el piloto, queda para la etapa 2): cabana_id, nombre, desde, hasta (date), precio_noche (int), min_noches (opcional)
- **Reserva**: codigo legible único (ej. `PV-0142`), cabana_id, check_in, check_out, adultos, ninos, huesped_nombre, huesped_email, huesped_telefono, huesped_rut (opcional), total, abono (int), estado, origen, expira_en (opcional), notas, timestamps
- **Pago**: reserva_id, proveedor (`mercadopago` | `flow` | `transferencia` | `efectivo`), monto, estado (`pendiente` | `aprobado` | `rechazado`), ref_externa, pagado_en
- **Auditoria**: reserva_id o cabana_id (+ bloqueo_id sin FK), usuario_id, email, accion (`confirmar` | `cancelar` | `registrar_pago` | `marcar_revisado` | `crear_bloqueo` | `eliminar_bloqueo`), estado_antes, estado_despues, detalle, created_at. Solo se agrega (RLS: `panel_admin` inserta a su propio nombre y lee; no edita ni borra).
- **Bloqueo**: cabana_id, desde, hasta, motivo, origen (`manual` | `ical`), uid_externo (opcional)
- **CalendarioExterno** (etapa 2, sin usar en el MVP): cabana_id, plataforma (`airbnb` | `booking`), url_ical, ultimo_sync

### Restricción anti doble reserva (obligatoria)

Prisma no la soporta en el schema, así que va en una migración creada con `prisma migrate dev --create-only` y editada a mano:

```sql
create extension if not exists btree_gist;

alter table "Reserva" add constraint reserva_sin_traslape
  exclude using gist (
    cabana_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (estado in ('pendiente_pago', 'confirmada'));
```

Ajusta los nombres de tabla y columna a como Prisma los genere (usa `@@map` y `@map` para dejar tablas y columnas en snake_case). Antes de insertar una reserva, revisa también los `Bloqueo` en la Server Action.

## Estructura

```
app/
  page.tsx                                 portada: directorio de propiedades (una cabaña: va directo a ella; varias: a su lista)
  (public)/[propiedad]/page.tsx            página de la propiedad: lista de sus cabañas activas
  (public)/[propiedad]/[cabana]/page.tsx   página pública de la cabaña
  reservar/[propiedad]/[cabana]/           fechas + datos del huésped (el slug de cabaña solo es único dentro de su propiedad)
  reserva/[codigo]/page.tsx                confirmación
  admin/login, admin/confirmar, admin/salir   login con link mágico, callback y salida
  admin/(panel)/                           panel del dueño (protegido por proxy.ts y requerirAdmin): resumen del día
  admin/(panel)/reservas/[codigo]/         lista con filtros y detalle con acciones
  admin/(panel)/bloqueos/                  bloquear y liberar fechas
  api/                                     webhooks (pagos) y cron; iCal en la etapa 2
lib/
  db.ts            cliente Prisma
  precios.ts       cálculo de precio por tarifa y del abono (funciones puras con tests)
  disponibilidad.ts
  formato.ts       moneda CLP y fechas en es-CL
prisma/
  schema.prisma
  seed.ts
```

## Convenciones

- Server Components por defecto; `"use client"` solo donde haya interacción.
- Mutaciones con Server Actions validadas con Zod.
- La lógica de negocio (precios, disponibilidad) va en `lib/` como funciones puras y con tests (Vitest).
- Componentes pequeños, sin librerías de UI pesadas. Tailwind directo.
- Mobile first: la mayoría de los huéspedes llega desde Instagram o WhatsApp en el celular.
- Commits pequeños y descriptivos en español, uno por paso terminado.
- Nunca muestres en la terminal el contenido de .env ni URLs de conexión con contraseña. Si necesitas verificarlo, di solo si las variables existen.

## Fuera de alcance (no construir aunque parezca útil)

Chatbot o IA, WhatsApp Business API, boleta electrónica SII, multi-idioma, cupones, channel manager por API, registro automático de nuevas propiedades.

Sincronización iCal e integración con Airbnb y Booking: etapa 2, después del piloto (plan actualizado el 4 de octubre de 2026). La tabla `CalendarioExterno` y el origen `ical` de `Bloqueo` ya existen, pero quedan sin usar. Mientras tanto, si la cabaña piloto también publica en esas plataformas, el dueño bloquea esas fechas a mano en el panel. El panel sí incluye reservas manuales (WhatsApp, teléfono) con origen `manual`.

## Comandos

- `npm run dev`: servidor local
- `npx prisma migrate dev`: aplicar migraciones. En Prisma 7 no regenera el cliente: después corre `npx prisma generate` y reinicia `npm run dev`.
- `npx prisma db seed`: cargar datos de ejemplo
- `npm test`: tests (funciones puras)
- `npm run test:db`: tests contra la base de .env (RLS y acceso entre propiedades); crean y borran sus datos
- `npm run admin:registrar -- <email> <slug-propiedad> [dueno|staff]`: da acceso al panel (necesita `SUPABASE_SERVICE_ROLE_KEY` en .env, solo local)
