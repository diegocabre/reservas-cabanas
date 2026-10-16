"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { verificarAntiBot } from "@/lib/anti-bot";
import { claveHash, consumirIntento, ipDeLaSolicitud, limites, MENSAJE_LIMITE } from "@/lib/limites";
import { pedirAccesoHuesped, replicarResena, solicitarPrivacidad } from "@/lib/resenas";

// Derechos del huésped (Ley 21.719). Sin cuenta: se entra con un link de 24 h enviado al correo.

export type EstadoMisDatos = { error?: string; hecho?: string };

/** Límite por IP y por token (si lo hay) para los formularios de /mis-datos. */
async function dentroDelLimite(formData: FormData, token?: string): Promise<boolean> {
  const lim = limites();
  const ip = claveHash("ip", ipDeLaSolicitud(await headers()));
  const ok = token
    ? (await consumirIntento("mis_datos", ip, lim.consultasPorIpHora, 60)) &&
      (await consumirIntento("mis_datos", claveHash("token", token), lim.consultasPorIpHora, 60))
    : await consumirIntento("pedir_link", ip, lim.linksPorIpHora, 60);
  if (!ok) console.warn(JSON.stringify({ evento: "limite_superado", accion: token ? "mis_datos" : "pedir_link_huesped" }));
  return ok;
}

export async function accionPedirAcceso(_previo: EstadoMisDatos, formData: FormData): Promise<EstadoMisDatos> {
  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(formData.get("email"));
  if (!email.success) return { error: "Revisa el email." };
  if (!(await dentroDelLimite(formData))) return { error: MENSAJE_LIMITE };
  // Un bot recibe la misma respuesta que todos, sin que se envíe nada.
  if (verificarAntiBot(formData, { exigirMarca: false }).ok) await pedirAccesoHuesped(email.data);
  // Mismo mensaje exista o no el email: no revelamos quién se ha alojado.
  return { hecho: "Si ese email tiene estadías con nosotros, te enviamos un link para entrar. Revisa tu correo (vence en 24 horas)." };
}

export async function accionReplicar(_previo: EstadoMisDatos, formData: FormData): Promise<EstadoMisDatos> {
  const token = String(formData.get("token") ?? "");
  const resenaId = z.uuid().safeParse(formData.get("resenaId"));
  if (!resenaId.success) return { error: "Reseña inválida." };
  if (!verificarAntiBot(formData, { exigirMarca: false }).ok) return { error: "El link venció. Pide uno nuevo." };
  if (!(await dentroDelLimite(formData, token))) return { error: MENSAJE_LIMITE };
  const r = await replicarResena(token, resenaId.data, formData.get("texto"));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/mis-datos/${token}`);
  return { hecho: "Guardamos tu respuesta. Los anfitriones la verán junto a la reseña." };
}

export async function accionSolicitar(_previo: EstadoMisDatos, formData: FormData): Promise<EstadoMisDatos> {
  const token = String(formData.get("token") ?? "");
  if (!verificarAntiBot(formData, { exigirMarca: false }).ok) return { error: "El link venció. Pide uno nuevo." };
  if (!(await dentroDelLimite(formData, token))) return { error: MENSAJE_LIMITE };
  const r = await solicitarPrivacidad(token, formData.get("tipo"), formData.get("mensaje"));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/mis-datos/${token}`);
  return { hecho: "Recibimos tu solicitud. La revisaremos y te responderemos por correo." };
}
