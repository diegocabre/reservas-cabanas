"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { avisarSolicitudNueva } from "@/lib/aprobacion";
import { MENSAJE_ANTIBOT, verificarAntiBot } from "@/lib/anti-bot";
import { enviarEmailReservaApartada } from "@/lib/emails";
import { claveHash, consumirIntento, cupoCorreo, ipDeLaSolicitud, limites, MENSAJE_LIMITE } from "@/lib/limites";
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

  const antiBot = verificarAntiBot(formData, { exigirMarca: true });
  if (!antiBot.ok) {
    console.warn(JSON.stringify({ evento: "antibot_rechazado", accion: "reservar", motivo: antiBot.motivo }));
    return { error: MENSAJE_ANTIBOT, valores };
  }

  const validado = esquemaReserva.safeParse(valores);
  if (!validado.success) {
    return { errores: z.flattenError(validado.error).fieldErrors, valores };
  }

  // Se cuenta solo lo que pasa la validación: equivocarse en un campo no gasta intentos.
  const ip = ipDeLaSolicitud(await headers());
  if (!(await consumirIntento("reservar", claveHash("ip", ip), limites().reservasPorIpHora, 60))) {
    console.warn(JSON.stringify({ evento: "limite_superado", accion: "reservar" }));
    return { error: MENSAJE_LIMITE, valores };
  }

  const resultado = await crearReservaWeb(validado.data);
  if (!resultado.ok) return { error: resultado.error, valores };

  const { codigo } = resultado;
  const { email } = validado.data;
  if (resultado.estado === "pendiente_aprobacion") {
    // Solicitud: "recibimos tu solicitud" al huésped (con tope diario por dirección) y aviso al dueño.
    after(async () => avisarSolicitudNueva(codigo, { huesped: await cupoCorreo(email) }));
  } else {
    // El link para pagar queda en el email del huésped, por si cierra la página (con tope diario por dirección).
    after(async () => {
      if (await cupoCorreo(email)) await enviarEmailReservaApartada(codigo);
    });
  }
  redirect(`/reserva/${codigo}`);
}
