import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { urlLogin } from "@/lib/acceso";
import { cargarAdmin, tienePropiedadSuspendida } from "@/lib/panel-acceso";
import { cargarSuperadmin } from "@/lib/resenas";
import { clienteSupabase } from "@/lib/supabase/servidor";

/**
 * Callback del link mágico. Acepta los dos formatos de Supabase:
 * - token_hash + type (plantilla de email personalizada): funciona aunque el link se abra en
 *   otro navegador, por ejemplo desde la app de Gmail en el celular.
 * - code (plantilla por defecto, PKCE): solo funciona en el navegador donde se pidió el link.
 * Después verifica que el usuario administre al menos una propiedad; si no, cierra la sesión.
 * Siempre vuelve a /admin: no se acepta un destino desde la URL.
 */
export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const tokenHash = parametros.get("token_hash");
  const tipo = parametros.get("type") as EmailOtpType | null;
  const code = parametros.get("code");

  const supabase = await clienteSupabase();
  let usuarioId: string | undefined;
  if (tokenHash && tipo) {
    usuarioId = (await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).data.user?.id;
  } else if (code) {
    usuarioId = (await supabase.auth.exchangeCodeForSession(code)).data.user?.id;
  }
  if (!usuarioId) redirect(urlLogin("link"));

  if (await cargarAdmin(usuarioId)) redirect("/admin");
  // Superadmin de la plataforma sin propiedades activas: entra a /admin/plataforma.
  if (await cargarSuperadmin(usuarioId)) redirect("/admin/plataforma");
  await supabase.auth.signOut();
  redirect(urlLogin((await tienePropiedadSuspendida(usuarioId)) ? "suspendida" : "sin-acceso"));
}
