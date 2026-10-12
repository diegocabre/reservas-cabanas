// Cuentas de Mercado Pago conectadas por cada propiedad (OAuth): conectar, desconectar, estado y
// tokens para cobrar (renovándolos antes de que venzan). Los tokens se guardan cifrados y solo se
// leen aquí, en el servidor, con la conexión postgres: el rol del panel no tiene acceso a la tabla.

import { MercadoPagoConfig, OAuth } from "mercadopago";
import { cifrar, claveDeCifrado, descifrar } from "@/lib/cifrado";
import { db } from "@/lib/db";
import { necesitaRenovar, urlRetorno, vencimiento } from "@/lib/mercadopago-oauth";
import type { AdminSesion } from "@/lib/panel-acceso";
import { urlDelSitio } from "@/lib/sitio";

/** Credenciales de la aplicación de Soluciones DyS en Mercado Pago Developers. */
export function aplicacionMercadoPago(env: Record<string, string | undefined> = process.env) {
  const clientId = env.MERCADOPAGO_CLIENT_ID;
  const clientSecret = env.MERCADOPAGO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** ¿Está configurada la conexión de cuentas (aplicación + clave de cifrado)? */
export function conexionDisponible(): boolean {
  return Boolean(aplicacionMercadoPago() && process.env.MERCADOPAGO_CLAVE_CIFRADO);
}

function clienteOAuth(clientSecret: string) {
  // El SDK manda un Authorization: Bearer en /oauth/token; Mercado Pago valida client_id y client_secret del cuerpo.
  return new OAuth(new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? clientSecret, options: { timeout: 10_000 } }));
}

/** Solo un admin con rol dueño de esa propiedad puede conectar o desconectar su cuenta. */
export function puedeGestionarCobros(admin: AdminSesion, propiedadId: string): boolean {
  return admin.propiedades.some((p) => p.id === propiedadId && p.rol === "dueno");
}

export type ResultadoCuenta = { ok: true } | { ok: false; error: string };

/** Cambia el `code` de la autorización por los tokens del dueño y los guarda cifrados. */
export async function conectarCuenta(admin: AdminSesion, propiedadId: string, code: string): Promise<ResultadoCuenta> {
  if (!puedeGestionarCobros(admin, propiedadId)) return { ok: false, error: "Solo el dueño de la propiedad puede conectar su Mercado Pago." };
  const app = aplicacionMercadoPago();
  if (!app) return { ok: false, error: "La conexión con Mercado Pago no está configurada." };

  const r = await clienteOAuth(app.clientSecret).create({
    body: { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: urlRetorno(urlDelSitio()) },
  });
  if (!r.access_token || !r.refresh_token || !r.user_id) {
    return { ok: false, error: "Mercado Pago no entregó la autorización. Intenta conectar de nuevo." };
  }

  const clave = claveDeCifrado();
  const datos = {
    mpUserId: String(r.user_id),
    accessTokenCifrado: cifrar(r.access_token, clave),
    refreshTokenCifrado: cifrar(r.refresh_token, clave),
    publicKey: r.public_key ?? null,
    expiraEn: vencimiento(r.expires_in),
    produccion: r.live_mode ?? true,
    conectadaPor: admin.email,
  };
  await db.$transaction([
    db.cuentaMercadoPago.upsert({ where: { propiedadId }, create: { propiedadId, ...datos }, update: datos }),
    db.auditoria.create({
      data: {
        propiedadId,
        usuarioId: admin.usuarioId,
        email: admin.email,
        accion: "conectar_mercadopago",
        detalle: `Cuenta de Mercado Pago ${datos.mpUserId}${datos.produccion ? "" : " (de prueba)"}`,
      },
    }),
  ]);
  return { ok: true };
}

/** Quita la cuenta conectada: la propiedad deja de cobrar en línea (salvo en modo prueba). */
export async function desconectarCuenta(admin: AdminSesion, propiedadId: string): Promise<ResultadoCuenta> {
  if (!puedeGestionarCobros(admin, propiedadId)) return { ok: false, error: "Solo el dueño de la propiedad puede desconectar su Mercado Pago." };
  const cuenta = await db.cuentaMercadoPago.findUnique({ where: { propiedadId }, select: { mpUserId: true } });
  if (!cuenta) return { ok: false, error: "Esta propiedad no tiene una cuenta conectada." };
  await db.$transaction([
    db.cuentaMercadoPago.delete({ where: { propiedadId } }),
    db.auditoria.create({
      data: {
        propiedadId,
        usuarioId: admin.usuarioId,
        email: admin.email,
        accion: "desconectar_mercadopago",
        detalle: `Cuenta de Mercado Pago ${cuenta.mpUserId}`,
      },
    }),
  ]);
  return { ok: true };
}

/**
 * ¿La propiedad tiene una cuenta de Mercado Pago conectada y vigente? Sin descifrar nada: lo usan
 * las páginas públicas para decidir si se puede reservar en línea.
 */
export async function tieneCuentaConectada(propiedadId: string, ahora = new Date()): Promise<boolean> {
  return (await db.cuentaMercadoPago.count({ where: { propiedadId, expiraEn: { gt: ahora } } })) > 0;
}

/** Estado de la conexión de las propiedades del admin, sin tokens. */
export async function estadoCuentas(admin: AdminSesion) {
  const cuentas = await db.cuentaMercadoPago.findMany({
    where: { propiedadId: { in: admin.propiedades.map((p) => p.id) } },
    select: { propiedadId: true, mpUserId: true, produccion: true, conectadaPor: true, updatedAt: true },
  });
  return new Map(cuentas.map((c) => [c.propiedadId, c]));
}

/**
 * Access token de una cuenta conectada, renovado si le queda poco. Renueva con la fila bloqueada:
 * Mercado Pago cambia el refresh_token en cada renovación, así que dos renovaciones a la vez
 * dejarían uno inválido.
 */
async function tokenVigente(where: { propiedadId: string } | { mpUserId: string }): Promise<string | null> {
  const app = aplicacionMercadoPago();
  const cuenta = await db.cuentaMercadoPago.findFirst({ where, select: { id: true, accessTokenCifrado: true, expiraEn: true } });
  if (!cuenta) return null;
  const clave = claveDeCifrado();
  if (!necesitaRenovar(cuenta.expiraEn) || !app) return cuenta.expiraEn > new Date() ? descifrar(cuenta.accessTokenCifrado, clave) : null;

  try {
    return await db.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<{ access_token_cifrado: string; refresh_token_cifrado: string; expira_en: Date }[]>`
        select access_token_cifrado, refresh_token_cifrado, expira_en from cuenta_mercadopago where id = ${cuenta.id}::uuid for update`;
      // Otro proceso la renovó mientras esperábamos.
      if (!necesitaRenovar(fila.expira_en)) return descifrar(fila.access_token_cifrado, clave);

      const r = await clienteOAuth(app.clientSecret).refresh({
        body: { client_id: app.clientId, client_secret: app.clientSecret, refresh_token: descifrar(fila.refresh_token_cifrado, clave) },
      });
      if (!r.access_token || !r.refresh_token) throw new Error("Mercado Pago no devolvió tokens al renovar");
      await tx.cuentaMercadoPago.update({
        where: { id: cuenta.id },
        data: {
          accessTokenCifrado: cifrar(r.access_token, clave),
          refreshTokenCifrado: cifrar(r.refresh_token, clave),
          expiraEn: vencimiento(r.expires_in),
        },
      });
      return r.access_token;
    });
  } catch (e) {
    console.error("No se pudo renovar el token de Mercado Pago", { cuenta: cuenta.id }, e);
    // Si todavía no vence, se sigue usando; se reintenta la renovación en el próximo uso.
    return cuenta.expiraEn > new Date() ? descifrar(cuenta.accessTokenCifrado, clave) : null;
  }
}

/** Token para cobrar a nombre de una propiedad, o null si no conectó su cuenta (o venció). */
export function tokenDePropiedad(propiedadId: string): Promise<string | null> {
  return tokenVigente({ propiedadId });
}

/** Token del vendedor que aparece en un aviso de Mercado Pago (user_id), o null. */
export function tokenDeVendedor(mpUserId: string): Promise<string | null> {
  return tokenVigente({ mpUserId });
}
