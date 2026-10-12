# Reservas Cabañas Sur

**Reserva directa para cabañas y hoteles boutique del sur de Chile: el huésped ve la disponibilidad, reserva, paga el abono con Mercado Pago y recibe su confirmación, sin comisiones de plataforma.**

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-estricto-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_Auth-3FCF8E?logo=supabase&logoColor=white)
![Mercado Pago](https://img.shields.io/badge/Mercado_Pago-Checkout_Pro-00B1EA)
![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white)
![Licencia](https://img.shields.io/badge/licencia-todos_los_derechos_reservados-lightgrey)

> Sitio en vivo: **[reservas.solucionesdys.cl](https://reservas.solucionesdys.cl/)**

Proyecto de **Soluciones DyS SpA**, construido en público en Instagram ([@solucionesdys.cl](https://www.instagram.com/solucionesdys.cl)) entre el 28 de septiembre y el 26 de octubre de 2026.

---

## Índice

- [El problema](#el-problema)
- [Características](#características)
- [Tecnologías](#tecnologías)
- [Requisitos previos](#requisitos-previos)
- [Instalación paso a paso](#instalación-paso-a-paso)
- [Configuración (.env)](#configuración-env)
- [Uso](#uso)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Tests](#tests)
- [Despliegue en Vercel](#despliegue-en-vercel)
- [Roadmap](#roadmap)
- [Cómo contribuir](#cómo-contribuir)
- [Licencia](#licencia)
- [Autor](#autor)

---

## El problema

Las cabañas del sur de Chile (Puerto Varas, Frutillar, Ensenada, la costa de Osorno) venden gran parte de sus noches por Airbnb o Booking y pagan comisión por cada reserva. Los huéspedes que llegan por Instagram o WhatsApp terminan coordinando a mano: fotos por chat, "¿tienes libre el fin de semana?", transferencias y capturas de pantalla.

Reservas Cabañas Sur le da a cada propiedad **su propia página de reservas**: el huésped ve fotos y videos reales, elige fechas libres en un calendario, conoce el precio para su grupo, paga el abono en línea y recibe la confirmación por email. El dinero va directo a la cuenta de Mercado Pago del dueño, y el dueño gestiona todo desde un panel simple.

## Características

### Para el huésped

- **Página pública por propiedad y por cabaña**, con galería de fotos y videos verticales, servicios, capacidad y ubicación.
- **Calendario de disponibilidad** (react-day-picker, en español) que respeta reservas, bloqueos y la estadía mínima de cada cabaña.
- **Precio calculado al instante** según el tamaño del grupo y la cantidad de noches (tabla `Tarifa`). El servidor siempre recalcula el total.
- **Pago del abono con Mercado Pago Checkout Pro.** La reserva queda apartada 30 minutos mientras se paga.
- **Emails con Resend + React Email**: "reserva apartada" (con el link para pagar) y "reserva confirmada".
- **`/mi-reserva`**: el huésped vuelve a su reserva con su código y su email.
- **Página de confirmación** (`/reserva/[codigo]`) que no expone datos personales (email oculto, sin teléfono ni RUT).
- **Validación del RUT chileno** con dígito verificador.
- **Botón de WhatsApp prellenado**: si la cabaña no tiene pago en línea, se reserva por WhatsApp.

### Para el dueño (panel `/admin`)

- **Login con link mágico** (Supabase Auth), sin registro abierto.
- **Resumen del día**, **lista de reservas con filtros** y **detalle de cada reserva**.
- **Acciones sobre reservas**: confirmar, cancelar (con motivo), registrar un pago recibido (efectivo, transferencia o Mercado Pago) y marcar pagos en revisión como revisados.
- **Bloqueo de fechas** (Airbnb, Booking, mantención, uso personal), con aviso si chocan con una reserva.
- **Conexión de su propia cuenta de Mercado Pago** por OAuth (`/admin/cobros`), con tokens cifrados en la base.
- **Auditoría** de cada acción: quién, cuándo, estado antes y después.

### Garantías técnicas

- **Imposible reservar dos veces las mismas fechas**: restricción `EXCLUDE USING gist` en Postgres sobre `daterange(check_in, check_out, '[)')`, más un cerrojo por cabaña (`pg_advisory_xact_lock`).
- **Pagos verificados contra la API de Mercado Pago**, nunca contra el aviso ni la URL. Procesamiento idempotente: un mismo pago no se aplica dos veces.
- **Multi-propiedad desde el inicio**, con **Row Level Security** en todas las tablas y un rol `panel_admin` que limita a cada admin a sus propiedades.
- **Montos en pesos enteros (CLP)**, fechas de estadía como `date` y zona horaria `America/Santiago`.
- **Tema visual por propiedad** con verificación de contraste WCAG AA.
- **Modo prueba** (activo por defecto): avisos visibles y reservas marcadas `[PRUEBA]` mientras no haya pago real.
- **Expiración automática** de reservas no pagadas con Vercel Cron.

## Tecnologías

| Área | Herramienta |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions) + React 19 |
| Lenguaje | TypeScript en modo estricto |
| Estilos | Tailwind CSS 4 |
| Base de datos | [Supabase](https://supabase.com) (Postgres) |
| ORM | [Prisma 7](https://www.prisma.io) con `@prisma/adapter-pg` |
| Autenticación | Supabase Auth (link mágico por email) |
| Validación | Zod 4 |
| Calendario | react-day-picker + date-fns (locale `es`) |
| Pagos | Mercado Pago Checkout Pro + OAuth |
| Emails | Resend + React Email |
| Tests | Vitest |
| Deploy | Vercel (+ Vercel Cron) |

## Requisitos previos

Antes de empezar necesitas:

1. **Node.js 20 o superior** (el proyecto se desarrolla con Node 24). Revisa tu versión con `node -v`.
2. **npm** (viene con Node).
3. **Git**.
4. Una **cuenta gratuita en [Supabase](https://supabase.com)** con un proyecto creado.
5. *(Opcional, para probar pagos)* Una cuenta en **[Mercado Pago Developers](https://www.mercadopago.cl/developers)** con credenciales de prueba.
6. *(Opcional, para enviar emails)* Una cuenta en **[Resend](https://resend.com)**.

Sin Mercado Pago ni Resend la app funciona igual en local: no cobra ni envía emails, pero puedes navegar, reservar en modo prueba y usar el panel.

## Instalación paso a paso

### 1. Clona el repositorio

```bash
git clone https://github.com/diegocabre/reservas-cabanas.git
```

```bash
cd reservas-cabanas
```

### 2. Instala las dependencias

```bash
npm install
```

Esto también ejecuta `prisma generate` (script `postinstall`), que crea el cliente de Prisma en `lib/generated/`.

### 3. Crea tu archivo `.env`

Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

En Windows (PowerShell) usa `Copy-Item .env.example .env`.

Ahora completa los valores. Lo mínimo para arrancar en local:

- `DATABASE_URL` y `DIRECT_URL`: en Supabase, ve a **Project Settings → Database → Connection string**.
  - `DATABASE_URL`: el pooler en modo **Transaction** (puerto `6543`).
  - `DIRECT_URL`: el pooler en modo **Session** (puerto `5432`).
  - Si tu contraseña tiene caracteres especiales (`? ! $ # / @`), codifícalos para URL (por ejemplo `?` → `%3F`).
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: en **Project Settings → API keys**, del mismo proyecto.

Revisa la sección [Configuración (.env)](#configuración-env) para el detalle de cada variable.

> ⚠️ Nunca subas tu `.env` a GitHub. Ya está en `.gitignore`.

### 4. Crea las tablas en la base de datos

```bash
npx prisma migrate deploy
```

Esto aplica todas las migraciones de `prisma/migrations/`: tablas, la restricción anti doble reserva, RLS y el rol `panel_admin`.

### 5. Carga los datos de ejemplo

```bash
npx prisma db seed
```

Se crean dos propiedades:

- **Cabañas Lago Llanquihue** (`/lago-llanquihue`): propiedad demo con dos cabañas de demostración.
- **Cabaña Maicolpue** (`/maicolpue`): la cabaña piloto, con su galería y sus tarifas.

### 6. Levanta el servidor

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador. ¡Listo! 🎉

### 7. *(Opcional)* Date acceso al panel del dueño

El panel no tiene registro abierto. Para crear un admin necesitas `SUPABASE_SERVICE_ROLE_KEY` en tu `.env` (solo en local) y luego:

```bash
npm run admin:registrar -- tu@email.cl maicolpue dueno
```

El último argumento es el rol: `dueno` (por defecto) o `staff`. Después entra a [http://localhost:3000/admin/login](http://localhost:3000/admin/login) y pide el link mágico con ese email.

## Configuración (.env)

| Variable | ¿Obligatoria? | Para qué sirve |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión a Postgres por pooler (Transaction, puerto 6543). La usa la app. |
| `DIRECT_URL` | Sí | Conexión por pooler en Session (puerto 5432). La usa Prisma para migraciones. |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto de Supabase (login del panel). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Llave pública de Supabase. Con RLS sin políticas no puede leer ninguna tabla. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo local | Llave secreta, únicamente para `npm run admin:registrar`. **Nunca en Vercel.** |
| `NEXT_PUBLIC_SITE_URL` | No | URL pública del sitio (metadata y vista previa en WhatsApp). Si falta, usa la de Vercel o `http://localhost:3000`. |
| `RESERVAS_MODO_PRUEBA` | No | Modo prueba activo por defecto. Ponla en `false` para cobrar de verdad. |
| `MERCADOPAGO_ACCESS_TOKEN` | Para pagos de prueba | Access Token de la cuenta de la plataforma. Solo se usa en modo prueba. |
| `MERCADOPAGO_WEBHOOK_SECRET` | No | Clave para validar la firma de los avisos de Mercado Pago. |
| `MERCADOPAGO_CLIENT_ID` | Para OAuth | Aplicación de Mercado Pago con la que cada dueño conecta su cuenta. |
| `MERCADOPAGO_CLIENT_SECRET` | Para OAuth | Secreto de esa aplicación. |
| `MERCADOPAGO_CLAVE_CIFRADO` | Para OAuth | 32 bytes en base64 para cifrar los tokens de los dueños. Si se pierde, cada dueño debe reconectar su cuenta. |
| `RESEND_API_KEY` | Para emails | Sin ella no se envían emails (solo queda un aviso en la consola). |
| `EMAIL_REMITENTE` | No | Dirección remitente de los emails. Tiene un valor por defecto. |
| `CRON_SECRET` | En producción | Secreto que Vercel envía al cron que expira reservas no pagadas. |

Para generar `MERCADOPAGO_CLAVE_CIFRADO`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

La URL de redirección registrada en tu aplicación de Mercado Pago debe ser `https://<tu-dominio>/admin/mercadopago/conectado`.


## Uso

### Recorrido del huésped

1. Entra a la portada `/`: lista las propiedades publicadas.
2. Abre una propiedad, por ejemplo `/maicolpue`, y luego una cabaña: `/maicolpue/maicolpue`.
3. Toca **Reservar**: en `/reservar/maicolpue/maicolpue` eliges fechas, adultos y niños, y completas tus datos (nombre, email, teléfono y RUT).
4. Se crea la reserva en estado `pendiente_pago` con un código como `MA-7K3QX9` y tienes 30 minutos para pagar el abono.
5. Pagas con Mercado Pago y vuelves a `/reserva/<codigo>`, donde ves la confirmación. También te llega por email.
6. Más tarde puedes volver a tu reserva en `/mi-reserva` con tu código y tu email.

En modo prueba verás avisos en el botón, el formulario y la confirmación. Las cabañas demo nunca cobran.

### Ejemplo de precio y abono

Las tarifas viven en la tabla `Tarifa` (precio por noche según personas y noches). Con un precio de `$60.000` por noche para 4 personas:

| Personas | Noches | Total | Abono (50 %) | Saldo |
| --- | --- | --- | --- | --- |
| 4 | 3 | $180.000 | $90.000 | $90.000 |

Si no hay tarifa para el grupo, el cálculo falla con un error claro: nunca se cobra $0.

### Panel del dueño

| Ruta | Qué hace |
| --- | --- |
| `/admin` | Resumen del día |
| `/admin/reservas` | Lista con filtros |
| `/admin/reservas/<codigo>` | Detalle: confirmar, cancelar, registrar pago, marcar revisado |
| `/admin/bloqueos` | Bloquear y liberar fechas |
| `/admin/cobros` | Conectar o desconectar la cuenta de Mercado Pago (solo rol `dueno`) |

### Scripts disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en `http://localhost:3000` |
| `npm run build` | Compila para producción |
| `npm start` | Sirve la versión compilada |
| `npm run lint` | Revisa el código con ESLint |
| `npm test` | Tests de la lógica de negocio (funciones puras) |
| `npm run test:watch` | Tests en modo observador |
| `npm run test:db` | Tests contra la base del `.env` (RLS y acceso entre propiedades). Crean y borran sus propios datos |
| `npm run admin:registrar -- <email> <slug-propiedad> [dueno\|staff]` | Da acceso al panel |
| `npm run probar:doble-reserva` | Demo: muestra cómo la base de datos rechaza una doble reserva |
| `npx prisma db seed` | Carga los datos de ejemplo |
| `npx tsx scripts/vista-previa-email.mts` | Genera un HTML de vista previa de los emails (no envía nada) |

> Si creas una migración nueva con `npx prisma migrate dev`, en Prisma 7 debes correr después `npx prisma generate` y reiniciar `npm run dev`.

## Estructura del proyecto

```
reservas-cabanas/
├── app/
│   ├── page.tsx                         Portada: directorio de propiedades
│   ├── (public)/[propiedad]/            Página de la propiedad y de cada cabaña
│   ├── reservar/[propiedad]/[cabana]/   Calendario + datos del huésped
│   ├── reserva/[codigo]/                Confirmación y botón de pago
│   ├── mi-reserva/                      Buscar una reserva con código + email
│   ├── admin/                           Login, callback, salida y conexión de Mercado Pago
│   │   └── (panel)/                     Panel protegido: resumen, reservas, bloqueos, cobros
│   └── api/
│       ├── webhooks/mercadopago/        Avisos de pago
│       └── cron/expirar-reservas/       Expira reservas no pagadas
├── components/                          Componentes de UI (calendario, galería, tarjetas…)
├── emails/                              Plantillas de React Email
├── lib/                                 Lógica de negocio y acceso a datos (con tests *.test.ts)
│   ├── precios.ts                       Precio por tarifa y abono
│   ├── disponibilidad.ts                Fechas libres y expiración
│   ├── pagos.ts / mercadopago*.ts       Pagos y cuentas de Mercado Pago
│   ├── panel-*.ts                       Datos y acciones del panel
│   ├── publicacion.ts                   Reglas para publicar, reservar y cobrar
│   └── …
├── prisma/
│   ├── schema.prisma                    Modelo de datos
│   ├── migrations/                      Migraciones SQL (incluye anti doble reserva y RLS)
│   ├── seed.ts                          Datos de ejemplo
│   └── registrar-admin.ts               Script para crear admins
├── public/                              Imágenes y galerías (public/piloto/<cabaña>/galeria/)
├── scripts/                             Demos y utilidades
├── tests/db/                            Tests contra la base (RLS, acceso, bloqueos, pagos)
├── proxy.ts                             Middleware de Next 16: revisa la sesión del panel
└── vercel.json                          Cron cada 30 minutos
```

### Modelo de datos

`Propiedad`, `Admin`, `Cabana`, `Tarifa`, `Reserva`, `Pago`, `Auditoria`, `Bloqueo`, `CuentaMercadoPago`, más `Temporada` y `CalendarioExterno`, que ya existen pero quedan para la etapa 2.

Estados de una reserva: `pendiente_pago` → `confirmada` → `completada`, o `cancelada`.

## Tests

La lógica de negocio (precios, disponibilidad, RUT, códigos, pagos, estados, bloqueos, temas…) está en funciones puras con tests:

```bash
npm test
```

Los tests de base de datos verifican que RLS impida a un admin ver datos de otra propiedad. Usan la base de tu `.env`:

```bash
npm run test:db
```

## Despliegue en Vercel

1. Importa el repositorio en [Vercel](https://vercel.com/new).
2. Agrega las variables de entorno de la tabla anterior, **excepto** `SUPABASE_SERVICE_ROLE_KEY`.
3. Despliega. `vercel.json` registra el cron `/api/cron/expirar-reservas` cada 30 minutos.
4. En Mercado Pago, configura el webhook apuntando a `https://<tu-dominio>/api/webhooks/mercadopago`.
5. Cuando todo esté listo para cobrar de verdad, define `RESERVAS_MODO_PRUEBA=false`.

> Fuera del modo prueba, una propiedad con datos marcados `PENDIENTE` (ubicación, WhatsApp, email, instrucciones de llegada o política de cancelación) no se publica ni cobra, y una cabaña sin cuenta de Mercado Pago conectada solo se reserva por WhatsApp.

## Roadmap

- [x] Página pública por propiedad y cabaña, con galería
- [x] Calendario de disponibilidad y precio por tarifa
- [x] Reserva con abono en línea (Mercado Pago Checkout Pro)
- [x] Emails de reserva apartada y confirmada
- [x] Restricción anti doble reserva en Postgres
- [x] Panel del dueño: reservas, acciones, bloqueos y auditoría
- [x] Cuenta de Mercado Pago propia por propiedad (OAuth)
- [x] Expiración automática de reservas no pagadas
- [ ] Crear reservas manuales (WhatsApp, teléfono) desde el panel
- [ ] Cabaña piloto en producción recibiendo reservas pagadas
- [ ] **Etapa 2:** sincronización iCal con Airbnb y Booking (`node-ical` / `ical-generator`)
- [ ] **Etapa 2:** precios por temporada (la tabla `Temporada` ya existe)

**Fuera de alcance** (decisión de diseño): chatbot o IA, WhatsApp Business API, boleta electrónica SII, multi-idioma, cupones, channel manager por API y registro automático de nuevas propiedades.

## Cómo contribuir

¡Las ideas y correcciones son bienvenidas! El código es de uso reservado (ver [Licencia](#licencia)), así que las contribuciones se reciben solo como *Pull Requests* a este repositorio. Al enviar uno, aceptas que Soluciones DyS SpA lo incorpore y lo use en el proyecto.

1. Haz un *fork* del repositorio.
2. Crea una rama para tu cambio:
   ```bash
   git checkout -b mi-mejora
   ```
3. Sigue las convenciones del proyecto:
   - Server Components por defecto; `"use client"` solo donde haya interacción.
   - Mutaciones con Server Actions validadas con Zod.
   - La lógica de negocio va en `lib/` como funciones puras **con tests**.
   - Interfaz en español de Chile, mobile first, Tailwind directo (sin librerías de UI pesadas).
   - Montos como enteros en CLP; nunca `float`.
   - Toda tabla nueva activa RLS en su migración.
   - Commits pequeños y descriptivos, en español.
4. Asegúrate de que pasen los tests y el linter:
   ```bash
   npm test
   ```
   ```bash
   npm run lint
   ```
5. Abre un *Pull Request* explicando qué cambia y por qué.

Antes de agregar una dependencia nueva, abre un *issue* para conversarlo. En `CLAUDE.md` están todas las reglas del dominio en detalle.

## Licencia

© 2026 Soluciones DyS SpA. Todos los derechos reservados.

El código se publica para que se pueda leer, pero no se permite copiarlo, modificarlo, distribuirlo ni usarlo con fines comerciales sin autorización escrita de Soluciones DyS SpA. Ver [LICENSE](LICENSE).

## Autor

**Diego Cabré**, de **Soluciones DyS SpA**

- Sitio: [reservas.solucionesdys.cl](https://reservas.solucionesdys.cl/)

- Instagram: [@solucionesdys.cl](https://www.instagram.com/solucionesdys.cl)
- GitHub: [diegocabre](https://github.com/diegocabre)
