"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirAdmin } from "@/lib/admin";
import { MOTIVOS_BLOQUEO } from "@/lib/bloqueos";
import { hoyEnChile } from "@/lib/formato";
import { crearBloqueo, eliminarBloqueo, type ConflictoReserva } from "@/lib/panel-bloqueos";

// Server Actions de bloqueos. Verifican al admin en cada llamada, validan con Zod y delegan en
// lib/panel-bloqueos.ts (transacción con RLS, cerrojo por cabaña, revisión de conflictos y auditoría).

export type EstadoBloqueo = {
  error?: string;
  /** Reservas que impiden el bloqueo, para mostrarlas. */
  conflictos?: ConflictoReserva[];
  valores?: Record<string, string>;
};

const esquema = z.object({
  cabanaId: z.uuid({ error: "Elige la cabaña." }),
  primeraNoche: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elige la primera noche." }),
  ultimaNoche: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elige la última noche." }),
  motivo: z.enum(MOTIVOS_BLOQUEO, { error: "Elige el motivo." }),
});

function terminar(hecho: string): never {
  revalidatePath("/admin", "layout");
  // Las páginas públicas se regeneran cada 5 minutos; el calendario de reserva consulta sin caché.
  revalidatePath("/[propiedad]/[cabana]", "page");
  redirect(`/admin/bloqueos?hecho=${hecho}`);
}

export async function accionCrearBloqueo(_previo: EstadoBloqueo, formData: FormData): Promise<EstadoBloqueo> {
  const admin = await requerirAdmin();
  const valores = Object.fromEntries(["cabanaId", "primeraNoche", "ultimaNoche", "motivo"].map((k) => [k, String(formData.get(k) ?? "")]));
  const datos = esquema.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };

  const r = await crearBloqueo(admin, datos.data, hoyEnChile());
  if (!r.ok) return { error: r.error, conflictos: r.reservas, valores };
  terminar("creado");
}

export async function accionEliminarBloqueo(_previo: EstadoBloqueo, formData: FormData): Promise<EstadoBloqueo> {
  const admin = await requerirAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Bloqueo inválido." };

  const r = await eliminarBloqueo(admin, id.data);
  if (!r.ok) return { error: r.error };
  terminar("eliminado");
}
