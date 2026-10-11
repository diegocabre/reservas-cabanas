"use server";

import { redirect } from "next/navigation";
import { RUTA_LOGIN } from "@/lib/acceso";
import { clienteSupabase } from "@/lib/supabase/servidor";

export async function cerrarSesion() {
  const supabase = await clienteSupabase();
  await supabase.auth.signOut();
  redirect(RUTA_LOGIN);
}
