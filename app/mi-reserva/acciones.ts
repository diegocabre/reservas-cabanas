"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizarCodigo } from "@/lib/codigo";
import { verificarAntiBot } from "@/lib/anti-bot";
import { anotarIntento, claveHash, consumirIntento, ipDeLaSolicitud, limiteSuperado, limites, MENSAJE_LIMITE } from "@/lib/limites";
import { existeReserva } from "@/lib/reservas";

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

  const codigo = normalizarCodigo(r.data.codigo);
  // Límites: búsquedas por IP, y búsquedas fallidas por código (nadie prueba emails contra un código).
  const lim = limites();
  const claveCodigo = claveHash("codigo", codigo);
  if (
    !(await consumirIntento("buscar_reserva_ip", claveHash("ip", ipDeLaSolicitud(await headers())), lim.consultasPorIpHora, 60)) ||
    (await limiteSuperado("buscar_reserva_codigo", claveCodigo, lim.busquedasPorCodigoHora, 60))
  ) {
    console.warn(JSON.stringify({ evento: "limite_superado", accion: "buscar_reserva" }));
    return { ...valores, error: MENSAJE_LIMITE };
  }
  // Mismo mensaje si el código no existe o si el email no coincide: no revelamos cuál falló.
  if (!(await existeReserva(codigo, r.data.email))) {
    await anotarIntento("buscar_reserva_codigo", claveCodigo);
    return noEncontrada;
  }
  redirect(`/reserva/${codigo}`);
}
