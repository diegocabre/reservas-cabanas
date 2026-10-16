// Cabeceras de seguridad (next.config.ts → headers()). Sin CSP que bloquee: solo una propuesta en
// modo Report-Only, para evaluarla en la consola del navegador antes de aplicarla (docs/endurecimiento.md).

type Cabecera = { key: string; value: string };

/** HSTS de 6 meses, sin includeSubDomains ni preload por ahora. */
export const HSTS = "max-age=15552000";

/** CSP propuesta: solo informa en la consola (Report-Only), nunca bloquea. */
export const CSP_PROPUESTA = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.mercadopago.com https://*.mercadopago.cl https://*.mercadolibre.com",
].join("; ");

const GLOBALES: Cabecera[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: HSTS },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_PROPUESTA },
];

/**
 * Rutas con un token o un código en la URL (o el panel): nunca dentro de un iframe ajeno, sin enviar
 * la URL como referer y sin guardarse en caché. Las páginas públicas de la cabaña y de reservar no se
 * restringen: no consta que no se incrusten en otros sitios.
 */
export const RUTAS_PRIVADAS = ["/admin/:path*", "/mis-datos/:path*", "/resena/:path*", "/reserva/:path*"];

const PRIVADAS: Cabecera[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

export function cabecerasDeSeguridad() {
  return [
    { source: "/:path*", headers: GLOBALES },
    // Va después: en las rutas privadas, su Referrer-Policy reemplaza a la global.
    ...RUTAS_PRIVADAS.map((source) => ({ source, headers: PRIVADAS })),
  ];
}
