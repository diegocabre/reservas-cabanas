# Diagnóstico de seguridad y arquitectura (15 oct 2026)

Lectura del código fuente (app/, lib/, proxy.ts, configuración) más `npm audit`. Es una lectura, no una prueba: cada hallazgo se verifica antes de corregirlo (ver `docs/endurecimiento.md`).

Bien resuelto: todas las Server Actions del panel llaman a `requerirAdmin`/`requerirSuperadmin`; el panel tiene doble defensa (filtro por propiedad + RLS); tokens de Mercado Pago con AES-256-GCM; firmas comparadas en tiempo constante; tokens de reseñas guardados como hash; mensajes anti-enumeración.

## 1. Arquitectura y calidad

- **Estados guardados en `notas`.** `[PRUEBA]` y `[REVISAR PAGO]` se escriben en el campo de texto del huésped y se leen con `startsWith`/`includes`. Un huésped puede escribir esas marcas y cambiar el comportamiento.
- **`lib/resenas.ts` tiene 864 líneas**: tokens, cron, correos, moderación y derechos del huésped juntos.
- **`registrarPagoMercadoPago` hace demasiado**: API, elección de token, reglas, registro, estado y avisos; la decisión de estado no tiene tests.
- **Solo el panel tiene RLS como segunda defensa**: las rutas públicas usan `postgres` con BYPASSRLS y dependen del filtro del código.

## 2. Seguridad

Altas:
1. Next 16.3.6 vulnerable (envenenamiento de caché SSG/ISR, SSRF en optimización de imágenes); arreglado en 16.4.2. Prisma 7.10.0 arrastra `mysql2` y `deepmerge-ts` vulnerables; arreglado en 7.10.1.
2. Sin límite de intentos ni anti-bot en acciones públicas: un script puede ocupar todas las fechas de una cabaña y usar el sistema para enviar correos a terceros.

Medias:
3. El webhook acepta avisos sin firma si falta `MERCADOPAGO_WEBHOOK_SECRET`.
4. `cobroDeLaCuentaEsperada` devuelve `true` si la propiedad no tiene cuenta conectada: un pago de cualquier cuenta podría confirmar la reserva.
5. Sin cabeceras de seguridad (clickjacking del panel, HSTS, nosniff, Referrer-Policy en rutas con token).

## 3. Acciones prioritarias

1. Subir `next` a 16.4.2 y `prisma` a 7.10.1.
2. Limitar la creación de reservas y los envíos de correo.
3. Firma del webhook obligatoria fuera del modo prueba.
4. Regla explícita de cuenta de cobro.
5. Cabeceras de seguridad y estados fuera de `notas`.
