import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { mensajeLogin, urlLogin, type MotivoLogin } from "@/lib/acceso";
import { clienteSupabase } from "@/lib/supabase/servidor";

/**
 * Cierra la sesión y vuelve al login. requerirAdmin() redirige aquí cuando el usuario tiene
 * sesión pero no administra ninguna propiedad: un Server Component no puede borrar cookies,
 * un Route Handler sí. El botón "Salir" del panel usa la Server Action cerrarSesion.
 */
export async function GET(request: NextRequest) {
  const supabase = await clienteSupabase();
  await supabase.auth.signOut();
  const motivo = request.nextUrl.searchParams.get("motivo") ?? undefined;
  redirect(urlLogin(mensajeLogin(motivo) ? (motivo as MotivoLogin) : undefined));
}
