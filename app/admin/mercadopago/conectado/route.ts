import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requerirAdmin } from "@/lib/admin";
import { conectarCuenta } from "@/lib/mercadopago-cuentas";
import { COOKIE_ESTADO_OAUTH, verificarEstado } from "@/lib/mercadopago-oauth";
import { registrar, detalleError } from "@/lib/registro";

/**
 * Retorno de Mercado Pago después de que el dueño autoriza (o rechaza) la conexión.
 * Verifica la sesión, que el `state` coincida con la cookie (contra CSRF) y que el admin sea dueño
 * de esa propiedad; recién entonces cambia el `code` por los tokens.
 */
export async function GET(request: NextRequest) {
  const admin = await requerirAdmin();
  const parametros = request.nextUrl.searchParams;
  const almacen = await cookies();
  const propiedadId = verificarEstado(parametros.get("state"), almacen.get(COOKIE_ESTADO_OAUTH)?.value);
  almacen.delete({ name: COOKIE_ESTADO_OAUTH, path: request.nextUrl.pathname });

  const code = parametros.get("code");
  if (!propiedadId) redirect("/admin/cobros?error=estado");
  if (!code) redirect("/admin/cobros?error=rechazada"); // el dueño no autorizó

  let resultado: Awaited<ReturnType<typeof conectarCuenta>>;
  try {
    resultado = await conectarCuenta(admin, propiedadId, code);
  } catch (e) {
    registrar("error", "mercadopago_conexion_fallida", { propiedadId, detalle: detalleError(e) });
    redirect("/admin/cobros?error=mercadopago");
  }
  if (resultado.ok) {
    // La cabaña pasa de "Reservar por WhatsApp" a reservar y pagar en línea.
    revalidatePath("/[propiedad]/[cabana]", "page");
    redirect("/admin/cobros?hecho=conectada");
  }
  redirect("/admin/cobros?error=permiso");
}
