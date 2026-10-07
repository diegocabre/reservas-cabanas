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
- Noches = `check_out - check_in`. El precio se calcula noche por noche según la temporada que cubre cada noche.
- Si alguna noche no está cubierta por una `Temporada`, el cálculo de precio (`lib/precios.ts`) debe fallar con un error claro que indique la cabaña y la fecha sin temporada. Nunca cobrar 0 por esa noche.
- Estados de reserva: `pendiente_pago`, `confirmada`, `cancelada`, `completada`.
- Una reserva web nace en `pendiente_pago` con `expira_en = ahora + 30 min` (`MINUTOS_PARA_PAGAR` en `lib/disponibilidad.ts`). Las pendientes vencidas ya no ocupan fechas y se marcan `cancelada` antes de insertar una nueva reserva en esa cabaña.
- Código de reserva: `prefijo_codigo` de la propiedad + correlativo por propiedad con 4 dígitos (`LL-0001`). El correlativo se incrementa en la misma transacción que crea la reserva.
- En reservas web el RUT del huésped es obligatorio (validado con dígito verificador). En la base es opcional porque las reservas de Airbnb, Booking o manuales pueden no traerlo.
- La página `/reserva/[codigo]` no muestra email, teléfono ni RUT: los códigos son correlativos y fáciles de adivinar.
- Pago del abono con Mercado Pago Checkout Pro (`lib/mercadopago.ts`, lógica pura en `lib/pagos.ts`): la preferencia usa `external_reference = codigo`, cobra el abono exacto en CLP y expira junto con la reserva. Un pago se aplica SOLO después de consultarlo a la API de Mercado Pago (webhook `/api/webhooks/mercadopago` y regreso a `/reserva/[codigo]`); nunca se confía en el aviso ni en los parámetros de la URL. Es idempotente (`Pago` es único por `proveedor` + `ref_externa`). Si el monto no coincide, o el pago llega cuando las fechas ya se tomaron, la reserva no se confirma y queda `[REVISAR PAGO]` en `notas`.
- Por ahora hay una sola cuenta de Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`). En producción con cabañas reales, cada propiedad debe cobrar en su propia cuenta: el dinero del huésped no debe pasar por Soluciones DyS.
- Modo prueba (`enModoPrueba()` en `lib/sitio.ts`): activado por defecto mientras no haya pago en línea. Muestra avisos de prueba en el botón de reserva, el formulario y la confirmación, y marca las reservas con `[PRUEBA]` en `notas`. Se desactiva con `RESERVAS_MODO_PRUEBA=false`.
- Origen de reserva: `web`, `airbnb`, `booking`, `manual`.
- La base es multi-propiedad desde el inicio: toda cabaña pertenece a una `Propiedad`, y toda consulta del panel filtra por la propiedad del admin.
- RLS activado en todas las tablas; nuevas tablas también deben activarlo en su migración (`alter table "x" enable row level security;`, sin políticas). Toda lectura y escritura pasa por Prisma en el servidor, que se conecta como `postgres` (dueño de las tablas, con `BYPASSRLS`); la API pública de Supabase (`anon`, `authenticated`) no tiene acceso a nada. Incluye `_prisma_migrations`.

## Modelo de datos

Propiedad, Admin, Cabana, Temporada, Reserva, Pago, Bloqueo, CalendarioExterno.

- **Propiedad**: nombre, slug único, ubicacion, prefijo_codigo (único), ultimo_correlativo, whatsapp, email, abono_pct (default 50), politica_cancelacion, instrucciones_llegada
- **Admin**: id (= id de usuario de Supabase Auth), propiedad_id, email, rol (`dueno` | `staff`)
- **Cabana**: propiedad_id, nombre, slug (único por propiedad), capacidad, dormitorios, descripcion, servicios (text[]), fotos (text[]), min_noches, activa
- **Temporada**: cabana_id, nombre, desde, hasta (date), precio_noche (int), min_noches (opcional)
- **Reserva**: codigo legible único (ej. `PV-0142`), cabana_id, check_in, check_out, adultos, ninos, huesped_nombre, huesped_email, huesped_telefono, huesped_rut (opcional), total, abono (int), estado, origen, expira_en (opcional), notas, timestamps
- **Pago**: reserva_id, proveedor (`mercadopago` | `flow` | `transferencia`), monto, estado (`pendiente` | `aprobado` | `rechazado`), ref_externa, pagado_en
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
  page.tsx                                 redirige a la propiedad de ejemplo (portada propia más adelante)
  (public)/[propiedad]/page.tsx            página de la propiedad: lista de sus cabañas activas
  (public)/[propiedad]/[cabana]/page.tsx   página pública de la cabaña
  reservar/[propiedad]/[cabana]/           fechas + datos del huésped (el slug de cabaña solo es único dentro de su propiedad)
  reserva/[codigo]/page.tsx                confirmación
  admin/                                   panel del dueño (protegido)
  api/                                     webhooks (pagos) y cron; iCal en la etapa 2
lib/
  db.ts            cliente Prisma
  precios.ts       cálculo de precio por temporada (funciones puras con tests)
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
- `npm test`: tests
