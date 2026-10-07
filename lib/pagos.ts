// Lógica pura de pagos con Mercado Pago Checkout Pro (sin red ni base de datos).

import { createHmac, timingSafeEqual } from "node:crypto";

export interface DatosPreferencia {
  codigo: string;
  cabana: string;
  abono: number;
  emailHuesped: string;
  expiraEn: Date;
  urlSitio: URL;
}

/**
 * Preferencia de Checkout Pro para pagar el abono de una reserva.
 * - external_reference = código de reserva: así sabemos qué reserva paga cada pago.
 * - Expira junto con la reserva: Mercado Pago no acepta el pago después de `expira_en`.
 * - El aviso (webhook) y el regreso automático solo se configuran con https: Mercado Pago
 *   no puede llegar a localhost.
 */
export function armarPreferencia(d: DatosPreferencia) {
  const urlReserva = new URL(`/reserva/${d.codigo}`, d.urlSitio).toString();
  const https = d.urlSitio.protocol === "https:";
  return {
    items: [
      {
        id: d.codigo,
        title: `Abono reserva ${d.codigo} · ${d.cabana}`,
        quantity: 1,
        unit_price: d.abono,
        currency_id: "CLP",
      },
    ],
    payer: { email: d.emailHuesped },
    external_reference: d.codigo,
    back_urls: { success: urlReserva, failure: urlReserva, pending: urlReserva },
    ...(https
      ? {
          auto_return: "approved",
          notification_url: new URL("/api/webhooks/mercadopago", d.urlSitio).toString(),
        }
      : {}),
    expires: true,
    expiration_date_to: d.expiraEn.toISOString(),
  };
}

export type EstadoPagoInterno = "pendiente" | "aprobado" | "rechazado";

export type EvaluacionPago =
  | { tipo: "ajeno" } // el pago no es de esta reserva
  | { tipo: "monto_incorrecto"; monto: number }
  | { tipo: "valido"; estado: EstadoPagoInterno; monto: number };

/**
 * Interpreta un pago de Mercado Pago para una reserva. Un pago aprobado solo cuenta si es
 * por el abono exacto y en CLP: nunca se confirma una reserva por un monto distinto.
 */
export function evaluarPago(
  pago: { status?: string; external_reference?: string; transaction_amount?: number; currency_id?: string },
  reserva: { codigo: string; abono: number },
): EvaluacionPago {
  if (pago.external_reference !== reserva.codigo) return { tipo: "ajeno" };
  const monto = Math.round(pago.transaction_amount ?? 0);

  if (pago.status === "approved") {
    if (pago.currency_id !== "CLP" || monto !== reserva.abono) return { tipo: "monto_incorrecto", monto };
    return { tipo: "valido", estado: "aprobado", monto };
  }
  if (["pending", "in_process", "in_mediation", "authorized"].includes(pago.status ?? "")) {
    return { tipo: "valido", estado: "pendiente", monto };
  }
  // rejected, cancelled, refunded, charged_back y cualquier estado desconocido.
  return { tipo: "valido", estado: "rechazado", monto };
}

/**
 * Valida la firma de un aviso de Mercado Pago (header x-signature: "ts=...,v1=...").
 * Plantilla firmada: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con HMAC-SHA256 y la
 * clave secreta del webhook. Igual consultamos el pago a la API antes de creerle al aviso.
 */
export function firmaValida(params: {
  secreto: string;
  firma: string | null;
  requestId: string | null;
  dataId: string;
}): boolean {
  if (!params.firma) return false;
  const partes = Object.fromEntries(
    params.firma.split(",").map((p) => p.split("=", 2).map((s) => s.trim()) as [string, string]),
  );
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;

  const plantilla = `id:${params.dataId.toLowerCase()};${params.requestId ? `request-id:${params.requestId};` : ""}ts:${ts};`;
  const esperada = createHmac("sha256", params.secreto).update(plantilla).digest("hex");
  const a = Buffer.from(esperada, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
