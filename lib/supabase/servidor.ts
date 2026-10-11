import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase se usa SOLO para autenticar (link mágico). Los datos se leen y escriben con Prisma:
// con RLS activado y sin políticas, la llave anónima no tiene acceso a ninguna tabla.

export function credencialesSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !llave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno");
  return { url, llave };
}

/** Cliente de Supabase Auth para Server Components, Server Actions y Route Handlers. */
export async function clienteSupabase() {
  const { url, llave } = credencialesSupabase();
  const almacen = await cookies();
  return createServerClient(url, llave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options);
        } catch {
          // En un Server Component no se pueden escribir cookies: proxy.ts renueva la sesión.
        }
      },
    },
  });
}
