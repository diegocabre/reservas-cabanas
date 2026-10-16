"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { candidatosCodigo } from "@/lib/codigo";
import { verificarAntiBot } from "@/lib/anti-bot";
import { anotarIntento, claveHash, consumirIntento, ipDeLaSolicitud, limiteSuperado, limites, MENSAJE_LIMITE } from "@/lib/limites";
import { existeReserva } from "@/lib/reservas";
import { registrar } from "@/lib/registro";

export type EstadoBusqueda = { error?: string; codigo?: string; email?: string };

const esquema = z.object({
  codigo: z.string().trim().min(4, { error: "Escribe tu código de reserva" }),
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Revisa el email" })),
});

export async function buscarReserva(_previo: EstadoBusqueda, formData: FormData): Promise<EstadoBusqueda> {
  const valores = { codigo: String(formData.get("codigo") ?? ""), email: String(formData.get("email") ?? "") };
  const noEncontrada = { ...valores, error: "No encontramos una reserva con ese código y ese email. Revisa los dos datos." };
  // Un bot recibe la misma respuesta que una búsqueda fallida.
  if (!verificarAntiBot(formData, { exigirMarca: false }).ok) return noEncontrada;
  const r = esquema.safeParse(valores);
  if (!r.success) return { ...valores, error: r.error.issues[0].message };

  const candidatos = candidatosCodigo(r.data.codigo);
  // Límites: búsquedas por IP, y búsquedas fallidas por código (nadie prueba emails contra un código).
  const lim = limites();
  const claveCodigo = claveHash("codigo", candidatos.join(" "));
  if (
    !(await consumirIntento("buscar_reserva_ip", claveHash("ip", ipDeLaSolicitud(await headers())), lim.consultasPorIpHora, 60)) ||
    (await limiteSuperado("buscar_reserva_codigo", claveCodigo, lim.busquedasPorCodigoHora, 60))
  ) {
    registrar("warn", "limite_superado", { accion: "buscar_reserva" });
    return { ...valores, error: MENSAJE_LIMITE };
  }
  // Sin guion el código puede tener el largo nuevo o el anterior: se prueban las dos formas.
  let codigo: string | undefined;
  for (const c of candidatos) if (!codigo && (await existeReserva(c, r.data.email))) codigo = c;
  // Mismo mensaje si el código no existe o si el email no coincide: no revelamos cuál falló.
  if (!codigo) {
    await anotarIntento("buscar_reserva_codigo", claveCodigo);
    return noEncontrada;
  }
  redirect(`/reserva/${codigo}`);
}
