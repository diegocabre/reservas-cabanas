"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirAdmin } from "@/lib/admin";
import { aplicacionMercadoPago, desconectarCuenta, puedeGestionarCobros } from "@/lib/mercadopago-cuentas";
import { COOKIE_ESTADO_OAUTH, generarEstado, RUTA_RETORNO_OAUTH, urlAutorizacion, urlRetorno } from "@/lib/mercadopago-oauth";
import { urlDelSitio } from "@/lib/sitio";

export type EstadoCobros = { error?: string };

/** Envía al dueño a Mercado Pago para autorizar la conexión de su cuenta. */
export async function accionConectar(_previo: EstadoCobros, formData: FormData): Promise<EstadoCobros> {
  const admin = await requerirAdmin();
  const propiedadId = z.uuid().safeParse(formData.get("propiedadId"));
  if (!propiedadId.success || !puedeGestionarCobros(admin, propiedadId.data)) {
    return { error: "Solo el dueño de la propiedad puede conectar su Mercado Pago." };
  }
  const app = aplicacionMercadoPago();
  if (!app) return { error: "La conexión con Mercado Pago todavía no está configurada en el sitio." };

  const estado = generarEstado(propiedadId.data);
  (await cookies()).set(COOKIE_ESTADO_OAUTH, estado, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // vuelve desde auth.mercadopago.com con una navegación normal
    path: RUTA_RETORNO_OAUTH,
    maxAge: 15 * 60,
  });
  redirect(urlAutorizacion({ clientId: app.clientId, redirectUri: urlRetorno(urlDelSitio()), estado }));
}

export async function accionDesconectar(_previo: EstadoCobros, formData: FormData): Promise<EstadoCobros> {
  const admin = await requerirAdmin();
  const propiedadId = z.uuid().safeParse(formData.get("propiedadId"));
  if (!propiedadId.success) return { error: "Propiedad inválida." };
  const r = await desconectarCuenta(admin, propiedadId.data);
  if (!r.ok) return { error: r.error };
  revalidatePath("/[propiedad]/[cabana]", "page");
  redirect("/admin/cobros?hecho=desconectada");
}
