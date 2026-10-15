"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pedirAccesoHuesped, replicarResena, solicitarPrivacidad } from "@/lib/resenas";

// Derechos del huésped (Ley 21.719). Sin cuenta: se entra con un link de 24 h enviado al correo.

export type EstadoMisDatos = { error?: string; hecho?: string };

export async function accionPedirAcceso(_previo: EstadoMisDatos, formData: FormData): Promise<EstadoMisDatos> {
  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(formData.get("email"));
  if (!email.success) return { error: "Revisa el email." };
  await pedirAccesoHuesped(email.data);
  // Mismo mensaje exista o no el email: no revelamos quién se ha alojado.
  return { hecho: "Si ese email tiene estadías con nosotros, te enviamos un link para entrar. Revisa tu correo (vence en 24 horas)." };
}

export async function accionReplicar(_previo: EstadoMisDatos, formData: FormData): Promise<EstadoMisDatos> {
  const token = String(formData.get("token") ?? "");
  const resenaId = z.uuid().safeParse(formData.get("resenaId"));
  if (!resenaId.success) return { error: "Reseña inválida." };
  const r = await replicarResena(token, resenaId.data, formData.get("texto"));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/mis-datos/${token}`);
  return { hecho: "Guardamos tu respuesta. Los anfitriones la verán junto a la reseña." };
}

export async function accionSolicitar(_previo: EstadoMisDatos, formData: FormData): Promise<EstadoMisDatos> {
  const token = String(formData.get("token") ?? "");
  const r = await solicitarPrivacidad(token, formData.get("tipo"), formData.get("mensaje"));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/mis-datos/${token}`);
  return { hecho: "Recibimos tu solicitud. La revisaremos y te responderemos por correo." };
}
