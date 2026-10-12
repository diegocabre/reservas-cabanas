# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Huésped que reserva (público principal).** Llega desde Instagram o WhatsApp, casi siempre en el celular, a la página de una cabaña concreta. Viene en grupo o en familia (la cabaña piloto recibe hasta 8 personas). Su trabajo: entender en segundos cómo es la cabaña y dónde está, ver qué fechas hay libres y cuánto cuesta para su grupo, reservar y pagar el abono, y quedarse tranquilo con una confirmación. Vuelve después a su reserva con código y email (`/mi-reserva`).

**Dueño de cabaña que evalúa el producto.** Dueño de cabañas u hoteles boutique del sur de Chile que ve el proyecto en el Instagram de Soluciones DyS (@solucionesdys.cl). Paga comisión en Airbnb o Booking y se pregunta si su cabaña se vería y funcionaría igual de bien con reserva directa. Mira la página piloto como prueba: "¿así se vería la mía?". Más adelante gestiona sus reservas, bloqueos y reservas manuales desde un panel simple.

## Product Purpose

Reservas Cabañas Sur es una vitrina de reservas directas: cada propiedad tiene su propia página pública donde el huésped ve disponibilidad, reserva, paga el abono en línea y recibe su confirmación, sin pasar por una plataforma que cobre comisión. Lo construye Soluciones DyS SpA en público para Instagram (28 sep a 26 oct 2026).

Éxito del MVP: la cabaña piloto real (Maicolpue) recibe reservas pagadas, y la serie de publicaciones consigue más dueños interesados ("busco 3 cabañas").

## Positioning

La reserva es directa con la cabaña: el huésped trata con el anfitrión, paga solo el abono para asegurar las fechas y el saldo queda con la cabaña. Cada página muestra el lugar real de esa cabaña con sus propias fotos y videos, no una ficha dentro de un catálogo. Está hecho para el sur de Chile: español de Chile, pesos chilenos, Mercado Pago, WhatsApp como canal natural.

## Operating Context

- Entrada: link en la bio o en historias de Instagram, o link compartido por WhatsApp (la vista previa usa la portada de la galería).
- Uso: celular, una mano, a veces con conexión móvil débil. *(Inferido del público y la zona; no medido.)*
- Flujo del huésped: página de la propiedad, luego página de la cabaña con galería, después calendario con datos del huésped, pago del abono con Mercado Pago y por último confirmación y email.
- La reserva queda apartada 30 minutos mientras se paga; el email "reserva apartada" trae el link para volver a pagar.
- Modo prueba activo mientras no haya pago en línea real: avisos visibles y reservas marcadas como prueba.
- El dueño recibe avisos por email y, en la etapa actual, bloquea a mano las fechas que vende en otras plataformas.

## Capabilities and Constraints

- Multi-propiedad: cada cabaña pertenece a una propiedad; hoy existen la demo "Cabañas Lago Llanquihue" (dos cabañas de demostración) y la piloto real "Cabaña Maicolpue".
- Precio por noche según tamaño del grupo y largo de la estadía (tabla `Tarifa`); abono de la piloto = 1 noche; estadía mínima de 1 noche; hasta 8 personas.
- Datos marcados PENDIENTE (ubicación exacta, WhatsApp, email, llegada, cancelación) bloquean la publicación fuera del modo prueba. Mientras falten, se muestran como pendientes; nunca se inventan.
- La página de una reserva no muestra datos personales del huésped (email oculto, sin teléfono ni RUT).
- Fuera de alcance: chatbot o IA, WhatsApp Business API, multi-idioma, cupones, channel manager, registro automático de propiedades. Sincronización iCal con Airbnb y Booking queda para la etapa 2.
- Sin decidir: dominio propio, nombre visible del anfitrión de la piloto, foto exterior de la cabaña.

## Brand Commitments

- **Voz:** habla la cabaña, en primera persona plural y de tú, con tuteo chileno cercano ("te esperamos", "te enviamos la ubicación por WhatsApp"). Concreta y cálida; nada de lenguaje de portal turístico genérico ("lo que encontrarás", "alojamiento con encanto").
- **Marca de la plataforma:** firma discreta. La cabaña es la protagonista; Reservas Cabañas Sur aparece como una firma pequeña al pie (sirve al dueño que evalúa y al contenido de Instagram). El huésped nunca siente que está en un portal.
- **Identidad por lugar:** la identidad visual de cada propiedad nace de su lugar real. La piloto está en Maicolpue, San Juan de la Costa: costa y bosque, no volcán ni lago. El volcán, el lago y el azul Llanquihue del demo no definen al producto ni a la piloto.
- **Dirección visual fijada por el dueño del proyecto (vinculante):** la calidez la ponen las fotos (madera de la cabaña, tonos naranjos); la interfaz usa un tono frío propio del mar y el bosque de esa costa.
- **Se evita (vinculante):** el look genérico de "alojamiento con encanto": fondo crema, serif tipo Fraunces y botón terracota.

## Evidence on Hand

- Galería real de la piloto: 7 medios verticales (4 videos con póster y 3 fotos) del interior: sala comedor con ventanal al bosque, cocina, dormitorios de ambos pisos. Ruta: `public/piloto/cabana-maicolpue/galeria/` (`galeria.json`); originales sin procesar en `public/piloto/cabana-maicolpue/`.
- Confirmado por las fotos: cabaña de madera de dos pisos, ventanal al bosque, cocina a gas. Número de dormitorios deducido de las fotos, por confirmar con el dueño.
- **Sin confirmar, no se afirma:** cercanía o vista al mar, distancia a la playa, ubicación exacta, WhatsApp, email, horarios de llegada y política de cancelación (todos PENDIENTE en el seed).
- **No existe y no se inventa:** reseñas o testimonios de huéspedes, nombre o foto del anfitrión, fotos del exterior de la cabaña o de la playa, cifras de ocupación o de ahorro en comisiones.
- La propiedad demo usa imágenes de paisaje de Osorno y Llanquihue que no son de una cabaña real; sirven solo como demostración.

## Product Principles

1. **El lugar real primero.** Lo que el huésped ve es esa cabaña y ese entorno, con su propio material; nunca una plantilla con otro nombre.
2. **Verdad antes que encanto.** Solo se afirma lo confirmado por el dueño o por las fotos; lo pendiente se dice como pendiente.
3. **Del Instagram al abono pagado, en el celular.** Cada pantalla se juzga por cuánto acerca a un huésped en el celular a reservar con confianza.
4. **Directo y cercano.** El trato es con la cabaña; la plataforma se nota solo como firma.
5. **Cada cabaña con su propia identidad.** El sistema permite que cada propiedad se vea como su lugar, sin rehacer el producto.

## Accessibility & Inclusion

- Mobile first: objetivos táctiles de al menos 44 px, texto legible sin zoom y contraste WCAG AA, también en avisos y botones desactivados.
- Interfaz solo en español de Chile; formatos CLP (`$120.000`) y zona horaria America/Santiago.
- Videos sin sonido por defecto y con alternativa en imagen fija; el contenido debe entenderse aunque el video no cargue.
