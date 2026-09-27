# MVP — Sistema de reservas para cabañas del sur (27 sep 2026)

Proyecto vitrina construido en público en @solucionesdys.cl, del 28 sep al 26 oct 2026. Meta: una cabaña piloto real recibiendo reservas pagadas + serie de 13 publicaciones.

## Alcance
- Entra: página pública por cabaña, calendario con precio por temporada, reserva con abono online (Mercado Pago o Flow), email de confirmación, botón de WhatsApp prellenado, sync iCal con Airbnb/Booking, panel del dueño, bloqueo de doble reserva en Postgres.
- Fuera: IA, WhatsApp Business API, boleta SII, multi-idioma, cupones, channel manager por API, registro automático de clientes.

## Stack
Next.js (App Router) + TS + Tailwind · Supabase (Postgres + Auth link mágico) · Prisma · Zod · react-day-picker + date-fns · Mercado Pago Checkout Pro · Resend + React Email · node-ical / ical-generator · Vercel + Cron.

## Modelo de datos
Propiedad, Admin, Cabana, Temporada, Reserva, Pago, Bloqueo, CalendarioExterno. Montos en CLP enteros; fechas de estadía como `date`.
Restricción clave: `exclude using gist (cabana_id with =, daterange(check_in, check_out, '[)') with &&) where estado in ('pendiente_pago','confirmada')`.

## Plan
- S1 (28 sep–4 oct): base, esquema, página pública, deploy.
- S2 (5–11 oct): calendario, precio por temporada, reserva pendiente, cerrar cabaña piloto.
- S3 (12–18 oct): Mercado Pago + webhook, email, WhatsApp, iCal, cron.
- S4 (19–25 oct): panel del dueño, tarifas, piloto en producción.

## Calendario Instagram (lun reel / mié carrusel / vie stories)
S1: problema · qué tendrá el sistema · boceto + encuesta. S2: página de la cabaña · comisiones de plataformas · calendario + bug. S3: sin doble reserva · abono/saldo/cancelación · primer pago de prueba. S4: consulta a pago en 60 s · caso piloto · "busco 3 cabañas". Lun 26 oct: 30 días en 30 segundos.

## Piloto
Conseguir cabaña antes del 9 oct; gratis 3 meses a cambio de aparecer en el contenido y reseña.

Artifact con el detalle completo (pantallas, tablas, checklist por semana, mensaje para piloto): https://claude.ai/artifact/3PzWnGGVMS3qnJWcikQkBn
