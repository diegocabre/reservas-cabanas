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
