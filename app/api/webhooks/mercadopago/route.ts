import { registrarPagoMercadoPago } from "@/lib/mercadopago";
import { firmaValida } from "@/lib/pagos";

/**
 * Aviso de Mercado Pago cuando cambia un pago. Solo usamos el id: el estado real se consulta
 * a la API en registrarPagoMercadoPago, así un aviso falso no puede confirmar nada.
 * Si MERCADOPAGO_WEBHOOK_SECRET existe, además se exige la firma del aviso.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const cuerpo = (await request.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string | number } };

  const tipo = cuerpo.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = String(cuerpo.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (tipo !== "payment" || !id) return Response.json({ ok: true, ignorado: true });

  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (
    secreto &&
    !firmaValida({
      secreto,
      firma: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: url.searchParams.get("data.id") ?? id,
    })
  ) {
    console.warn("Webhook de Mercado Pago con firma inválida", { id });
    return Response.json({ error: "Firma inválida" }, { status: 401 });
  }

  // Si algo falla respondemos 500 y Mercado Pago reintenta más tarde.
  const resultado = await registrarPagoMercadoPago(id);
  return Response.json({ ok: true, resultado });
}
