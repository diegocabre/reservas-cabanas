# Consultas públicas (sin RLS)

Las rutas públicas leen la base con Prisma como `postgres` (dueño de las tablas, con `BYPASSRLS`): **solo el filtro del código las limita**. Esta es la lista de cada consulta y qué la limita. Toda consulta pública nueva debe sumarse aquí y a `tests/db/consultas-publicas.test.ts`.

Límites de intentos por IP en estas rutas: ver `docs/endurecimiento.md`, fase 2.

## Lecturas

| Ruta | Función | Filtro que la limita | Qué devuelve |
| --- | --- | --- | --- |
| `/` | `obtenerDirectorio` (`lib/cabanas.ts`) | propiedades no suspendidas; cabañas activas (sin demo fuera del modo prueba) | nombres, fotos, capacidad, precio desde. Nada de reservas |
| `/[propiedad]` y layouts | `obtenerPropiedadPublica`, `obtenerTemaPropiedad` | `slug` de la propiedad, no suspendida | datos públicos de la propiedad y sus cabañas activas |
| `/[propiedad]/[cabana]` | `obtenerCabanaPublica` | `slug` de propiedad + `slug` de cabaña, activa, propiedad no suspendida | ficha de la cabaña, tarifas |
| `/[propiedad]/[cabana]` | `resenasPublicas` (`lib/resenas.ts`) | `cabanaId`, `estado = publicada`, `reserva.es_prueba = false` | nombre de pila, notas, comentario, respuesta. Sin email, teléfono ni código |
| `/reservar/...` | `obtenerDatosReserva` (`lib/reservas.ts`) | `slug` de propiedad + cabaña; reservas que ocupan y bloqueos desde hoy | **solo las noches ocupadas** (fechas). Sin código ni datos del huésped; las instrucciones de llegada no viajan al navegador |
| `/reserva/[codigo]` | `obtenerReservaPublica` | `codigo` único (≈40 bits en los nuevos; quien tiene el link ve la reserva) | nombre e inicial del apellido, email oculto (`d***@gmail.com`), fechas, montos, estado. Sin teléfono, RUT ni notas |
| `/reserva/[codigo]` | `puedeCobrarEnLinea` | `propiedad.id` de esa reserva | sí / no |
| `/resena/[token]` | `abrirInvitacion` | hash del token firmado (`token_hash`, único), vencimiento | cabaña, nombre de pila, fechas de esa reserva, su propia reseña |
| `/mis-datos/[token]` | `abrirAccesoHuesped` | hash del token de acceso (24 h) → `huesped.id` | datos del propio huésped y las reseñas publicadas sobre él |

## Acciones públicas (Server Actions y rutas)

| Ruta | Función | Filtro que la limita |
| --- | --- | --- |
| `/reservar/...` | `crearReservaWeb` | `slug` de propiedad + cabaña; recalcula precio y disponibilidad; solo escribe una reserva nueva |
| `/mi-reserva` | `existeReserva` | `codigo` **y** email (los dos); mismo mensaje si falla cualquiera |
| `/reserva/[codigo]` (botón pagar) | `iniciarPagoAbono` | `codigo`; solo si está por pagar |
| `/reserva/[codigo]?payment_id=` y webhook | `registrarPagoMercadoPago` | el pago se consulta a la API de Mercado Pago; su `external_reference` decide la reserva; la cuenta que cobró se verifica |
| `/resena/[token]` | `enviarResenaCabana` | hash del token, con la fila bloqueada; un solo uso |
| `/mis-datos` | `pedirAccesoHuesped` | email; mismo mensaje exista o no |
| `/mis-datos/[token]` | `replicarResena`, `solicitarPrivacidad` | token → `huesped.id`; la reseña debe ser de ese huésped |
| `/api/cron/*` | `procesarSolicitudes`, `procesarResenas` | `Authorization: Bearer ${CRON_SECRET}` |

## Test

`tests/db/consultas-publicas.test.ts` crea dos reservas en la misma cabaña y comprueba que:

- `obtenerReservaPublica(A)` trae solo A y ningún email, teléfono, RUT, apellido ni nota (de A ni de B);
- `existeReserva` con el código de una y el email de otra no la encuentra;
- `obtenerDatosReserva` trae solo noches ocupadas, sin códigos ni datos de huéspedes;
- la portada, la propiedad y la cabaña no traen datos de reservas.

Los tokens de reseñas y de "Mis datos" ya están cubiertos en `tests/db/resenas.test.ts`.
