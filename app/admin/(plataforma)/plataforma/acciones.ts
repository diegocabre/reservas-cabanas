"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirSuperadmin } from "@/lib/admin";
import { cambiarSuspension, elegirResenas } from "@/lib/plataforma";

// Plataforma (solo superadmin). Tras cada cambio se regenera TODO el sitio: una propiedad suspendida
// desaparece de la portada y de sus páginas en cache al tiro, sin esperar los 5 minutos del ISR.

export type EstadoPlataforma = { error?: string; hecho?: string };

const id = z.uuid();

export async function accionSuspension(_previo: EstadoPlataforma, formData: FormData): Promise<EstadoPlataforma> {
  const sa = await requerirSuperadmin();
  const propiedadId = id.safeParse(formData.get("propiedadId"));
  const suspender = formData.get("suspender") === "si";
  if (!propiedadId.success) return { error: "Propiedad inválida." };
  const r = await cambiarSuspension(sa, propiedadId.data, suspender);
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  return { hecho: suspender ? "Propiedad suspendida." : "Propiedad reactivada." };
}

export async function accionResenas(_previo: EstadoPlataforma, formData: FormData): Promise<EstadoPlataforma> {
  await requerirSuperadmin();
  const propiedadId = id.safeParse(formData.get("propiedadId"));
  if (!propiedadId.success) return { error: "Propiedad inválida." };
  const r = await elegirResenas(propiedadId.data, String(formData.get("resenas") ?? ""));
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  return { hecho: "Reseñas actualizadas." };
}
