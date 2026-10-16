"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verificarAntiBot } from "@/lib/anti-bot";
import { claveHash, consumirIntento, ipDeLaSolicitud, limites, MENSAJE_LIMITE } from "@/lib/limites";
import { enviarResenaCabana } from "@/lib/resenas";
import { CATEGORIAS } from "@/lib/resenas-reglas";

export type EstadoResena = { error?: string };

/**
 * Envío del formulario de reseña. El token viaja en un campo oculto y lib/resenas.ts lo valida y
 * lo consume (un solo uso); al guardar redirige al link nuevo, que sirve para editar mientras la
 * reseña esté retenida. Notas y comentario se validan y sanean en el servidor.
 */
export async function accionEnviarResena(_previo: EstadoResena, formData: FormData): Promise<EstadoResena> {
  const token = String(formData.get("token") ?? "");
  if (!verificarAntiBot(formData, { exigirMarca: false }).ok) return { error: "Este link no es válido o ya se usó." };
  const { consultasPorIpHora } = limites();
  if (
    !(await consumirIntento("resena", claveHash("ip", ipDeLaSolicitud(await headers())), consultasPorIpHora, 60)) ||
    !(await consumirIntento("resena", claveHash("token", token), consultasPorIpHora, 60))
  ) {
    console.warn(JSON.stringify({ evento: "limite_superado", accion: "resena" }));
    return { error: MENSAJE_LIMITE };
  }
  const notas = Object.fromEntries(CATEGORIAS.map((c) => [c.clave, formData.get(c.clave)]));
  const r = await enviarResenaCabana(token, { notas, comentario: formData.get("comentario") });
  if (!r.ok) return { error: r.error };
  redirect(`/resena/${r.token}?${r.publicada ? "publicada" : "guardada"}=1`);
}
