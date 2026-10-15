import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { RUTA_LOGIN, RUTA_SALIR } from "@/lib/acceso";
import { cargarAdmin, tienePropiedadSuspendida, type AdminSesion } from "@/lib/panel-acceso";
import { cargarSuperadmin, type Superadmin } from "@/lib/resenas";
import { clienteSupabase } from "@/lib/supabase/servidor";

// Sesión del panel. Toda página y Server Action de /admin parte con requerirAdmin() y pasa el
// admin a las consultas de lib/panel-datos.ts, que filtran por sus propiedades y corren con RLS.
// proxy.ts solo hace una revisión rápida de la sesión; la verificación real es esta.

/** Id del usuario de Supabase Auth con sesión válida, o null. */
export const usuarioDeLaSesion = cache(async (): Promise<string | null> => {
  const supabase = await clienteSupabase();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

/** Admin con sesión iniciada y al menos una propiedad, o null. Una vez por request. */
export const obtenerAdmin = cache(async (): Promise<AdminSesion | null> => {
  const usuarioId = await usuarioDeLaSesion();
  return usuarioId ? cargarAdmin(usuarioId) : null;
});

/**
 * Admin de la sesión, o redirige. Sin sesión: al login. Con sesión pero sin propiedades:
 * a /admin/salir, que cierra la sesión y muestra "sin acceso".
 */
export async function requerirAdmin(): Promise<AdminSesion> {
  const admin = await obtenerAdmin();
  if (admin) return admin;
  const usuarioId = await usuarioDeLaSesion();
  if (!usuarioId) redirect(RUTA_LOGIN);
  // Superadmin sin propiedades activas: su lugar es /admin/plataforma.
  if (await obtenerSuperadmin()) redirect("/admin/plataforma");
  // Suspendida a mitad de sesión: la siguiente página o acción la saca con el motivo.
  redirect(`${RUTA_SALIR}?motivo=${(await tienePropiedadSuspendida(usuarioId)) ? "suspendida" : "sin-acceso"}`);
}

/** Superadmin de la plataforma con sesión (tabla superadmin), o null. Una vez por request. */
export const obtenerSuperadmin = cache(async (): Promise<Superadmin | null> => {
  const usuarioId = await usuarioDeLaSesion();
  return usuarioId ? cargarSuperadmin(usuarioId) : null;
});

/** Superadmin de la sesión, o 404 (Plataforma y moderación no existen para nadie más). No necesita propiedades. */
export async function requerirSuperadmin(): Promise<Superadmin> {
  if (!(await usuarioDeLaSesion())) redirect(RUTA_LOGIN);
  const sa = await obtenerSuperadmin();
  if (!sa) notFound();
  return sa;
}
