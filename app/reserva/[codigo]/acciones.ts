"use server";

import { redirect } from "next/navigation";
import { iniciarPagoAbono } from "@/lib/mercadopago";

/** Crea la preferencia de Mercado Pago y lleva al huésped a pagar el abono. */
export async function pagarAbono(formData: FormData) {
  const codigo = String(formData.get("codigo") ?? "");
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
