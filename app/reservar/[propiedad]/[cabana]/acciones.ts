"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { enviarEmailReservaApartada } from "@/lib/emails";
import { esquemaReserva } from "@/lib/reserva-esquema";
import { crearReservaWeb } from "@/lib/reservas";

export type EstadoFormulario = {
  /** Error general (fechas tomadas, capacidad, etc.). */
  error?: string;
  /** Errores por campo, para mostrarlos bajo cada input. */
  errores?: Partial<Record<string, string[]>>;
  /** Lo que escribió el huésped, para no perderlo si algo falla. */
  valores?: Record<string, string>;
};

export async function crearReserva(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string") as [string, string][],
  );

  const validado = esquemaReserva.safeParse(valores);
  if (!validado.success) {
    return { errores: z.flattenError(validado.error).fieldErrors, valores };
  }

  const resultado = await crearReservaWeb(validado.data);
  if (!resultado.ok) return { error: resultado.error, valores };

  // El link para pagar queda en el email del huésped, por si cierra la página.
  const { codigo } = resultado;
  after(() => enviarEmailReservaApartada(codigo));
  redirect(`/reserva/${codigo}`);
}
