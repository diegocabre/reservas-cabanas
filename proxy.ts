import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requiereSesion, RUTA_LOGIN } from "@/lib/acceso";

/**
 * Renueva la sesión de Supabase en cada visita al panel y manda a /admin/login a quien no
 * tenga sesión. Es solo una revisión rápida: cada página y Server Action del panel vuelve a
 * verificar al admin y su propiedad con requerirAdmin() (lib/admin.ts).
 */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista, headers) {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
        for (const [clave, valor] of Object.entries(headers ?? {})) respuesta.headers.set(clave, valor);
      },
    },
  });

  // getClaims valida el token (y lo renueva si venció); no basta con leer la cookie.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && requiereSesion(request.nextUrl.pathname)) {
    const destino = NextResponse.redirect(new URL(RUTA_LOGIN, request.url));
    for (const cookie of respuesta.cookies.getAll()) destino.cookies.set(cookie);
    return destino;
  }
  return respuesta;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
