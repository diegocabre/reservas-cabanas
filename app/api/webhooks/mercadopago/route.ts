import { registrarPagoMercadoPago } from "@/lib/mercadopago";
import { esVendedorConectado } from "@/lib/mercadopago-cuentas";
import { aceptarAviso, revisarFirmaAviso, webhookEstricto } from "@/lib/pagos";
import { enModoPrueba } from "@/lib/sitio";

/**
 * Aviso de Mercado Pago cuando cambia un pago. Solo usamos el id: el estado real se consulta
 * a la API en registrarPagoMercadoPago, así un aviso falso no puede confirmar nada.
 * Firma: si MERCADOPAGO_WEBHOOK_SECRET existe, se exige (como siempre). Sin el secreto se procesa y
 * queda el log `webhook_firma_invalida`, salvo con MERCADOPAGO_WEBHOOK_STRICT=true fuera del modo
 * prueba, que rechaza (lib/pagos.ts → aceptarAviso).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const cuerpo = (await request.json().catch(() => ({}))) as {
    type?: string;
    action?: string;
    data?: { id?: string | number };
    /** Vendedor dueño del pago: con su cuenta conectada se consulta el pago. */
    user_id?: string | number;
  };

  const tipo = cuerpo.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = String(cuerpo.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (tipo !== "payment" || !id) return Response.json({ ok: true, ignorado: true });

  const estricto = webhookEstricto(enModoPrueba());
  const firma = revisarFirmaAviso({
    secreto: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    firma: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: url.searchParams.get("data.id") ?? id,
  });
  if (firma !== "valida") {
    // Sin datos personales ni tokens: solo el motivo y el id del pago.
    console.warn(JSON.stringify({ evento: "webhook_firma_invalida", motivo: firma, estricto, id }));
  }
  if (!aceptarAviso(firma, estricto)) return Response.json({ error: "Firma inválida" }, { status: 401 });

  const vendedor = cuerpo.user_id ?? url.searchParams.get("user_id");
  // Modo estricto: un user_id que no es una cuenta conectada guardada no se usa para nada.
  if (estricto && vendedor && !(await esVendedorConectado(String(vendedor)))) {
    console.warn(JSON.stringify({ evento: "webhook_vendedor_desconocido", id }));
    return Response.json({ ok: true, ignorado: true });
  }

  // Si algo falla respondemos 500 y Mercado Pago reintenta más tarde.
  const resultado = await registrarPagoMercadoPago(id, { mpUserId: vendedor ? String(vendedor) : null });
  console.info(JSON.stringify({ evento: "webhook_pago", id, resultado }));
  return Response.json({ ok: true, resultado });
}
