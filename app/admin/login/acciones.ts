"use server";

import { z } from "zod";
import { clienteSupabase } from "@/lib/supabase/servidor";
import { urlDelSitio } from "@/lib/sitio";

export type EstadoLogin = { error?: string; enviadoA?: string; email?: string };

const esquema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Revisa el email" })),
});

/**
 * Envía el link mágico para entrar al panel. Solo a usuarios ya creados (shouldCreateUser: false):
 * los admins se registran con npm run admin:registrar. Para no revelar qué emails tienen acceso,
 * la respuesta es la misma exista o no el usuario.
 */
export async function pedirLink(_previo: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "");
  const r = esquema.safeParse({ email });
  if (!r.success) return { email, error: r.error.issues[0].message };

  const supabase = await clienteSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: r.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: new URL("/admin/confirmar", urlDelSitio()).toString(),
    },
  });

  if (error?.status === 429) {
    return { email, error: "Pediste varios links seguidos. Espera unos minutos y vuelve a intentar." };
  }
  if (error && error.status !== 400 && error.status !== 422) {
    // 400/422: el email no tiene usuario. Cualquier otro error es del servicio y sí se avisa.
    // status 0 = no se llegó a Supabase (revisar NEXT_PUBLIC_SUPABASE_URL); 401 = llave anónima incorrecta.
    console.error("No se pudo enviar el link de ingreso", { status: error.status, code: error.code, mensaje: error.message });
    return { email, error: "No pudimos enviar el link. Intenta de nuevo en un momento." };
  }
  return { enviadoA: r.data.email };
}
