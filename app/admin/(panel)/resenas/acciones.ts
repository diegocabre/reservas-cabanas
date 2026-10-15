"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirAdmin } from "@/lib/admin";
import { reportarResena, responderResena } from "@/lib/resenas";
import { LARGO_COMENTARIO, MOTIVOS_REPORTE, resenasCabanaActivas } from "@/lib/resenas-reglas";

// Server Actions de /admin/resenas. Cada una vuelve a verificar al admin y delega en lib/resenas.ts,
// que trabaja con RLS: el dueño solo responde o reporta reseñas publicadas de SUS cabañas.

export type EstadoAccionResena = { error?: string; hecho?: string };

const esquemaRespuesta = z.object({
  resenaId: z.uuid(),
  texto: z.string().trim().min(1, { error: "Escribe tu respuesta." }).max(LARGO_COMENTARIO, { error: "Máximo 1.000 caracteres." }),
});

export async function accionResponder(_previo: EstadoAccionResena, formData: FormData): Promise<EstadoAccionResena> {
  const admin = await requerirAdmin();
  if (!resenasCabanaActivas()) return { error: "Las reseñas están desactivadas." };
  const datos = esquemaRespuesta.safeParse(Object.fromEntries(formData));
  if (!datos.success) return { error: datos.error.issues[0].message };
  const r = await responderResena(admin, datos.data.resenaId, datos.data.texto);
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/resenas");
  // La página pública se regenera sola (revalidate = 300): la respuesta aparece en unos minutos.
  return { hecho: "Respuesta publicada. Aparece en la página de la cabaña en unos minutos." };
}

const esquemaReporte = z.object({
  resenaId: z.uuid(),
  motivo: z.enum(Object.keys(MOTIVOS_REPORTE) as [keyof typeof MOTIVOS_REPORTE], { error: "Elige un motivo." }),
  detalle: z.string().trim().max(500, { error: "Máximo 500 caracteres." }).optional(),
});

export async function accionReportar(_previo: EstadoAccionResena, formData: FormData): Promise<EstadoAccionResena> {
  const admin = await requerirAdmin();
  const datos = esquemaReporte.safeParse(Object.fromEntries(formData));
  if (!datos.success) return { error: datos.error.issues[0].message };
  const r = await reportarResena(admin, datos.data.resenaId, datos.data.motivo, datos.data.detalle);
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/resenas");
  return { hecho: r.nuevo ? "Reporte enviado. Lo revisará el equipo de la plataforma." : "Ya habías reportado esta reseña." };
}
