/**
 * URL base del sitio para metadata (canónica, Open Graph).
 * 1. NEXT_PUBLIC_SITE_URL si está definida (dominio propio).
 * 2. VERCEL_PROJECT_PRODUCTION_URL, que Vercel entrega sola (sin protocolo).
 * 3. localhost en desarrollo.
 */
export function urlDelSitio(env: Record<string, string | undefined> = process.env): URL {
  if (env.NEXT_PUBLIC_SITE_URL) return new URL(env.NEXT_PUBLIC_SITE_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return new URL(`http://localhost:${env.PORT ?? 3000}`);
}
