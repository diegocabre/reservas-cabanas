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
- Más adelante: Mercado Pago Checkout Pro, Resend + React Email, node-ical / ical-generator, Vercel Cron
- Deploy en Vercel

Usa las versiones estables actuales de cada librería y sigue su documentación oficial. No agregues dependencias fuera de esta lista sin preguntar.

## Reglas del dominio

- Interfaz en español de Chile. Formato de moneda `$120.000` (CLP, sin decimales). Zona horaria `America/Santiago`.
- Montos siempre como enteros en CLP. Nunca `float` ni `Decimal` para dinero.
- Fechas de estadía (`check_in`, `check_out`) como `date`, no `timestamp`. El día de `check_out` queda libre para otra llegada.
- Todos los rangos de fechas son semiabiertos `[desde, hasta)`: el último día es EXCLUSIVO. Aplica a `Reserva` (`check_in`, `check_out`), `Temporada` (`desde`, `hasta`) y `Bloqueo` (`desde`, `hasta`), igual que `DTEND` en iCal. Ej.: una temporada del 15 dic al 28 feb se guarda como `desde = 15-dic`, `hasta = 1-mar`. Siempre `hasta > desde`.
- Noches = `check_out - check_in`. El precio se calcula noche por noche según la temporada que cubre cada noche.
- Estados de reserva: `pendiente_pago`, `confirmada`, `cancelada`, `completada`.
- Origen de reserva: `web`, `airbnb`, `booking`, `manual`.
- La base es multi-propiedad desde el inicio: toda cabaña pertenece a una `Propiedad`, y toda consulta del panel filtra por la propiedad del admin.

## Modelo de datos

Propiedad, Admin, Cabana, Temporada, Reserva, Pago, Bloqueo, CalendarioExterno.

- **Propiedad**: nombre, slug único, whatsapp, email, abono_pct (default 50), politica_cancelacion, instrucciones_llegada
- **Admin**: id (= id de usuario de Supabase Auth), propiedad_id, email, rol (`dueno` | `staff`)
- **Cabana**: propiedad_id, nombre, slug (único por propiedad), capacidad, dormitorios, descripcion, servicios (text[]), fotos (text[]), min_noches, activa
- **Temporada**: cabana_id, nombre, desde, hasta (date), precio_noche (int), min_noches (opcional)
- **Reserva**: codigo legible único (ej. `PV-0142`), cabana_id, check_in, check_out, adultos, ninos, huesped_nombre, huesped_email, huesped_telefono, huesped_rut (opcional), total, abono (int), estado, origen, expira_en (opcional), notas, timestamps
- **Pago**: reserva_id, proveedor (`mercadopago` | `flow` | `transferencia`), monto, estado (`pendiente` | `aprobado` | `rechazado`), ref_externa, pagado_en
- **Bloqueo**: cabana_id, desde, hasta, motivo, origen (`manual` | `ical`), uid_externo (opcional)
- **CalendarioExterno**: cabana_id, plataforma (`airbnb` | `booking`), url_ical, ultimo_sync

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
  (public)/[propiedad]/[cabana]/page.tsx   página pública de la cabaña
  reservar/[cabana]/                       fechas + datos del huésped
  reserva/[codigo]/page.tsx                confirmación
  admin/                                   panel del dueño (protegido)
  api/                                     webhooks e iCal
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

## Fuera de alcance (no construir aunque parezca útil)

Chatbot o IA, WhatsApp Business API, boleta electrónica SII, multi-idioma, cupones, channel manager por API, registro automático de nuevas propiedades.

## Comandos

- `npm run dev`: servidor local
- `npx prisma migrate dev`: aplicar migraciones
- `npx prisma db seed`: cargar datos de ejemplo
- `npm test`: tests
