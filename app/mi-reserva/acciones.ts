"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizarCodigo } from "@/lib/codigo";
import { existeReserva } from "@/lib/reservas";

export type EstadoBusqueda = { error?: string; codigo?: string; email?: string };

const esquema = z.object({
  codigo: z.string().trim().min(4, { error: "Escribe tu código de reserva" }),
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Revisa el email" })),
});

export async function buscarReserva(_previo: EstadoBusqueda, formData: FormData): Promise<EstadoBusqueda> {
  const valores = { codigo: String(formData.get("codigo") ?? ""), email: String(formData.get("email") ?? "") };
  const r = esquema.safeParse(valores);
  if (!r.success) return { ...valores, error: r.error.issues[0].message };

  const codigo = normalizarCodigo(r.data.codigo);
  // Mismo mensaje si el código no existe o si el email no coincide: no revelamos cuál falló.
  if (!(await existeReserva(codigo, r.data.email))) {
    return { ...valores, error: "No encontramos una reserva con ese código y ese email. Revisa los dos datos." };
  }
  redirect(`/reserva/${codigo}`);
}
