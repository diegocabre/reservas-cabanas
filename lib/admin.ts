import { redirect } from "next/navigation";
import { cache } from "react";
import { RUTA_INGRESAR } from "@/lib/acceso";
import { db } from "@/lib/db";
import { clienteSupabase } from "@/lib/supabase/servidor";

// Capa de acceso del panel. Toda página y Server Action de /admin parte con requerirAdmin() y
// filtra sus consultas por admin.propiedad.id: cada dueño solo ve y cambia lo de su propiedad.
// proxy.ts solo hace una revisión rápida; la verificación real es esta.

/** Admin con sesión iniciada, o null. Se calcula una vez por request (cache de React). */
export const obtenerAdmin = cache(async () => {
  const supabase = await clienteSupabase();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;

  return db.admin.findUnique({
    where: { id },
    select: { id: true, email: true, rol: true, propiedad: { select: { id: true, nombre: true, slug: true } } },
  });
});

export type AdminPanel = NonNullable<Awaited<ReturnType<typeof obtenerAdmin>>>;

/**
 * Admin con sesión, o redirige al ingreso. Un usuario de Supabase que no está en la tabla Admin
 * no entra a nada (la sesión existe, pero no tiene propiedad).
 */
export async function requerirAdmin(): Promise<AdminPanel> {
  const admin = await obtenerAdmin();
  if (admin) return admin;

  const supabase = await clienteSupabase();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    await supabase.auth.signOut();
    redirect(`${RUTA_INGRESAR}?error=sin-acceso`);
  }
  redirect(RUTA_INGRESAR);
}
