"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirAdmin } from "@/lib/admin";
import { configurarAprobacion } from "@/lib/aprobacion";
import { HORAS_MAXIMAS, HORAS_MINIMAS } from "@/lib/solicitudes";

export type EstadoCabana = { error?: string };

const horas = z.coerce
  .number({ error: "Escribe un número de horas." })
  .int({ error: "Usa horas enteras." })
  .min(HORAS_MINIMAS, { error: `Mínimo ${HORAS_MINIMAS} hora.` })
  .max(HORAS_MAXIMAS, { error: `Máximo ${HORAS_MAXIMAS} horas (7 días).` });

const esquema = z.object({
  cabanaId: z.uuid(),
  requiereAprobacion: z.literal("on").optional(),
  horasRespuestaAprobacion: horas,
  horasParaPagar: horas,
});

/** Guarda la aprobación manual de una cabaña. lib/aprobacion.ts revisa que sea el dueño (y RLS también). */
export async function accionConfigurarCabana(_previo: EstadoCabana, formData: FormData): Promise<EstadoCabana> {
  const admin = await requerirAdmin();
  const datos = esquema.safeParse(Object.fromEntries(formData));
  if (!datos.success) return { error: datos.error.issues[0].message };

  const r = await configurarAprobacion(admin, datos.data.cabanaId, {
    requiereAprobacion: datos.data.requiereAprobacion === "on",
    horasRespuestaAprobacion: datos.data.horasRespuestaAprobacion,
    horasParaPagar: datos.data.horasParaPagar,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin", "layout");
  redirect(`/admin/cabanas?hecho=${datos.data.cabanaId}`);
}
