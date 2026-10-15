"use server";

import { redirect } from "next/navigation";
import { enviarResenaCabana } from "@/lib/resenas";
import { CATEGORIAS, resenasCabanaActivas } from "@/lib/resenas-reglas";

export type EstadoResena = { error?: string };

/**
 * Envío del formulario de reseña. El token viaja en un campo oculto y lib/resenas.ts lo valida y
 * lo consume (un solo uso); al guardar redirige al link nuevo, que sirve para editar mientras la
 * reseña esté retenida. Notas y comentario se validan y sanean en el servidor.
 */
export async function accionEnviarResena(_previo: EstadoResena, formData: FormData): Promise<EstadoResena> {
  if (!resenasCabanaActivas()) return { error: "Las reseñas no están disponibles por ahora." };
  const token = String(formData.get("token") ?? "");
  const notas = Object.fromEntries(CATEGORIAS.map((c) => [c.clave, formData.get(c.clave)]));
  const r = await enviarResenaCabana(token, { notas, comentario: formData.get("comentario") });
  if (!r.ok) return { error: r.error };
  redirect(`/resena/${r.token}?${r.publicada ? "publicada" : "guardada"}=1`);
}
