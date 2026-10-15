"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirSuperadmin } from "@/lib/admin";
import { atenderSolicitudPrivacidad, resolverReporte } from "@/lib/resenas";

// Cola de moderación (solo superadmin). Ocultar no borra: la reseña queda en la base como "oculta".

export async function accionResolverReporte(formData: FormData): Promise<void> {
  const sa = await requerirSuperadmin();
  const datos = z.object({ reporteId: z.uuid(), decision: z.enum(["ocultar", "mantener"]) }).safeParse(Object.fromEntries(formData));
  if (!datos.success) return;
  await resolverReporte(sa, datos.data.reporteId, datos.data.decision === "ocultar");
  revalidatePath("/admin/moderacion");
}

export async function accionAtenderSolicitud(formData: FormData): Promise<void> {
  const sa = await requerirSuperadmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await atenderSolicitudPrivacidad(sa, id.data);
  revalidatePath("/admin/moderacion");
}
