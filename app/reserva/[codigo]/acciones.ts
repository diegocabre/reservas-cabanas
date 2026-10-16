"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { claveHash, consumirIntento, ipDeLaSolicitud, limites } from "@/lib/limites";
import { iniciarPagoAbono } from "@/lib/mercadopago";

/** Crea la preferencia de Mercado Pago y lleva al huésped a pagar el abono. */
export async function pagarAbono(formData: FormData) {
  const codigo = String(formData.get("codigo") ?? "");
  // Cada clic crea una preferencia en Mercado Pago: con tope por IP (mismo aviso de error que un fallo de pago).
  if (!(await consumirIntento("pagar_abono", claveHash("ip", ipDeLaSolicitud(await headers())), limites().consultasPorIpHora, 60))) {
    console.warn(JSON.stringify({ evento: "limite_superado", accion: "pagar_abono" }));
    redirect(`/reserva/${encodeURIComponent(codigo)}?error=pago`);
  }
  let resultado;
  try {
    resultado = await iniciarPagoAbono(codigo);
  } catch (e) {
    console.error("No se pudo iniciar el pago", e);
    redirect(`/reserva/${codigo}?error=pago`);
  }
  if (!resultado.ok) redirect(`/reserva/${codigo}?error=pago`);
  redirect(resultado.url);
}
