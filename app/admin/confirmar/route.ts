import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { clienteSupabase } from "@/lib/supabase/servidor";

/**
 * Destino del link mágico. Acepta los dos formatos de Supabase:
 * - token_hash + type (plantilla de email personalizada): funciona aunque el link se abra en
 *   otro navegador, por ejemplo desde la app de Gmail en el celular.
 * - code (plantilla por defecto, PKCE): solo funciona en el navegador donde se pidió el link.
 * Siempre vuelve a /admin: no se acepta un destino desde la URL.
 */
export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const tokenHash = parametros.get("token_hash");
  const tipo = parametros.get("type") as EmailOtpType | null;
  const code = parametros.get("code");

  const supabase = await clienteSupabase();
  let ok = false;
  if (tokenHash && tipo) {
    ok = !(await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  redirect(ok ? "/admin" : "/admin/ingresar?error=link");
}
