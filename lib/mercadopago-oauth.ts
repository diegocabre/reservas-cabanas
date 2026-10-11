// Conexión de la cuenta de Mercado Pago de cada propiedad (OAuth). Funciones puras.
//
// Flujo: el dueño pulsa "Conectar Mercado Pago" en el panel → va a auth.mercadopago.com con el
// client_id de la aplicación de Soluciones DyS → autoriza con SU sesión de Mercado Pago → vuelve a
// /admin/mercadopago/conectado con un `code` → el servidor lo cambia por un access_token de la cuenta
// del dueño. Los abonos se cobran con ese token: el dinero llega a la cuenta del dueño, nunca a la de
// Soluciones DyS. El dueño no entrega claves y puede revocar el permiso desde Mercado Pago.

import { randomBytes, timingSafeEqual } from "node:crypto";

export const URL_AUTORIZACION = "https://auth.mercadopago.com/authorization";
export const RUTA_RETORNO_OAUTH = "/admin/mercadopago/conectado";

/** Días antes del vencimiento (180 días) en que se renueva el token. */
export const DIAS_MARGEN_RENOVACION = 30;

export function urlRetorno(sitio: URL): string {
  return new URL(RUTA_RETORNO_OAUTH, sitio).toString();
}

/** URL a la que se envía al dueño para autorizar (mismos parámetros que arma el SDK oficial). */
export function urlAutorizacion(p: { clientId: string; redirectUri: string; estado: string }): string {
  const url = new URL(URL_AUTORIZACION);
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", p.estado);
  url.searchParams.set("redirect_uri", p.redirectUri);
  return url.toString();
}

/**
 * `state` del OAuth: la propiedad que se conecta + un valor aleatorio. Se guarda en una cookie
 * httpOnly al empezar y se compara al volver: así nadie puede pegarle a un dueño su propia cuenta
 * (CSRF) ni cambiar de propiedad a mitad del camino.
 */
export function generarEstado(propiedadId: string, azar: () => string = () => randomBytes(24).toString("base64url")): string {
  return `${propiedadId}.${azar()}`;
}

/** Propiedad del `state` si coincide exactamente con el de la cookie; si no, null. */
export function verificarEstado(recibido: string | null, guardado: string | undefined): string | null {
  if (!recibido || !guardado) return null;
  const a = Buffer.from(recibido);
  const b = Buffer.from(guardado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const propiedadId = recibido.split(".")[0];
  return /^[0-9a-f-]{36}$/i.test(propiedadId) ? propiedadId : null;
}

/** ¿Hay que renovar el token? Cuando le quedan menos de DIAS_MARGEN_RENOVACION días. */
export function necesitaRenovar(expiraEn: Date, ahora = new Date()): boolean {
  return expiraEn.getTime() - ahora.getTime() < DIAS_MARGEN_RENOVACION * 86_400_000;
}

/** Vencimiento a partir de `expires_in` (segundos) de Mercado Pago. Si no viene, 180 días. */
export function vencimiento(expiresIn: number | undefined, ahora = new Date()): Date {
  return new Date(ahora.getTime() + (expiresIn && expiresIn > 0 ? expiresIn : 180 * 86_400) * 1000);
}

export type Credencial = { origen: "propiedad"; accessToken: string } | { origen: "plataforma"; accessToken: string };

/**
 * Con qué cuenta se cobra el abono de una propiedad:
 * - Con la cuenta conectada de la propiedad, siempre que exista: el dinero va al dueño.
 * - Sin cuenta conectada, solo en modo prueba, con las credenciales de prueba de la plataforma.
 * - Sin cuenta conectada y fuera del modo prueba: no se cobra (el dinero del huésped no debe pasar
 *   por Soluciones DyS).
 */
export function elegirCredencial(p: {
  tokenPropiedad: string | null;
  tokenPlataforma: string | undefined;
  modoPrueba: boolean;
}): { ok: true; credencial: Credencial } | { ok: false; error: string } {
  if (p.tokenPropiedad) return { ok: true, credencial: { origen: "propiedad", accessToken: p.tokenPropiedad } };
  if (p.modoPrueba && p.tokenPlataforma) return { ok: true, credencial: { origen: "plataforma", accessToken: p.tokenPlataforma } };
  return { ok: false, error: "Esta cabaña todavía no conecta su cuenta de Mercado Pago para recibir pagos." };
}
