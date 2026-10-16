// Lógica pura de pagos con Mercado Pago Checkout Pro (sin red ni base de datos).

import { createHmac, timingSafeEqual } from "node:crypto";

export interface DatosPreferencia {
  codigo: string;
  cabana: string;
  abono: number;
  /**
   * Email para prellenar el pago. En modo prueba NO se envía: si es de una cuenta real de
   * Mercado Pago y la tienda usa credenciales de prueba, Mercado Pago rechaza el pago
   * ("una de las partes es de prueba").
   */
  emailHuesped: string | null;
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
    ...(d.emailHuesped ? { payer: { email: d.emailHuesped } } : {}),
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

/**
 * ¿El pago lo cobró la cuenta esperada? `esperado` es el id de vendedor de la cuenta conectada de la
 * propiedad; null cuando la propiedad cobra con la cuenta de la plataforma (solo en modo prueba).
 */
export function cobroDeLaCuentaEsperada(collectorId: number | string | undefined, esperado: string | null): boolean {
  if (esperado === null) return true;
  return collectorId !== undefined && String(collectorId) === esperado;
}

type Env = Record<string, string | undefined>;

/**
 * Interruptores de despliegue gradual (por defecto, apagados = comportamiento anterior):
 * - MERCADOPAGO_WEBHOOK_STRICT=true, fuera del modo prueba: el webhook rechaza avisos sin secreto
 *   configurado o sin firma válida, e ignora avisos de un vendedor (user_id) que no es una cuenta conectada.
 * - MERCADOPAGO_COBRO_ESTRICTO=true (también en modo prueba, para probarla en preview): regla
 *   explícita de la cuenta que cobra (verificarCuentaCobro).
 */
export const webhookEstricto = (modoPrueba: boolean, env: Env = process.env) => !modoPrueba && env.MERCADOPAGO_WEBHOOK_STRICT === "true";
export const cobroEstricto = (env: Env = process.env) => env.MERCADOPAGO_COBRO_ESTRICTO === "true";

export type FirmaAviso = "valida" | "sin_secreto" | "sin_firma" | "invalida";

/** Estado de la firma de un aviso: sin secreto configurado, sin cabecera, inválida o válida. */
export function revisarFirmaAviso(p: { secreto: string | undefined; firma: string | null; requestId: string | null; dataId: string }): FirmaAviso {
  if (!p.secreto) return "sin_secreto";
  if (!p.firma) return "sin_firma";
  return firmaValida({ secreto: p.secreto, firma: p.firma, requestId: p.requestId, dataId: p.dataId }) ? "valida" : "invalida";
}

/**
 * ¿Se procesa el aviso? Con secreto configurado, una firma ausente o inválida siempre se rechaza
 * (como siempre). Sin secreto se procesa, salvo en modo estricto. Igual se consulta el pago a la API.
 */
export function aceptarAviso(firma: FirmaAviso, estricto: boolean): boolean {
  if (firma === "valida") return true;
  if (firma === "sin_secreto") return !estricto;
  return false;
}

/** Con qué token se consultó el pago a la API de Mercado Pago. */
export type OrigenConsulta = "vendedor" | "propiedad" | "plataforma";

/**
 * ¿El pago lo cobró la cuenta que corresponde a la reserva?
 * - "ok": se aplica. "ignorar": no es de esta reserva (sin rastro). "revisar": un pago aprobado que no
 *   cumple la regla: queda [REVISAR PAGO] y se avisa al superadmin, nunca se descarta en silencio.
 * Sin modo estricto: la regla anterior (cobroDeLaCuentaEsperada). Con modo estricto: con cuenta
 * conectada, debe cobrarla esa cuenta; sin cuenta conectada, solo la cuenta de la plataforma (el pago
 * se consultó con su token) y solo en modo prueba.
 */
export function verificarCuentaCobro(p: {
  collectorId: number | string | undefined;
  vendedorEsperado: string | null;
  origenConsulta: OrigenConsulta;
  modoPrueba: boolean;
  estricto: boolean;
  aprobado: boolean;
}): "ok" | "ignorar" | "revisar" {
  if (!p.estricto) return cobroDeLaCuentaEsperada(p.collectorId, p.vendedorEsperado) ? "ok" : "ignorar";
  const cumple =
    p.vendedorEsperado !== null
      ? cobroDeLaCuentaEsperada(p.collectorId, p.vendedorEsperado)
      : p.origenConsulta === "plataforma" && p.modoPrueba;
  if (cumple) return "ok";
  return p.aprobado ? "revisar" : "ignorar";
}

/** Marca en `notas` de una reserva con un pago que el dueño debe revisar (monto distinto, fechas tomadas). */
export const MARCA_REVISAR = "[REVISAR PAGO]";

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

/** Qué hacer con un pago ya evaluado, según la reserva y lo que ya estaba registrado. */
export type DecisionPago =
  | { accion: "revisar"; detalle: string } // queda [REVISAR PAGO] en la reserva; resultado "revisar"
  | { accion: "terminar"; resultado: "pendiente" | "rechazado" | "ya_registrado" }
  | { accion: "confirmar" }; // intentar confirmar (puede terminar en revisión por bloqueo o traslape)

/**
 * Decide en qué queda la reserva con un pago de esta reserva (evaluacion distinta de "ajeno").
 * Función pura: registrarPagoMercadoPago (lib/mercadopago.ts) solo ejecuta lo que se decide aquí.
 */
export function decidirEstadoPago(p: {
  evaluacion: Exclude<EvaluacionPago, { tipo: "ajeno" }>;
  refExterna: string;
  estadoReserva: string;
  pagoYaAprobado: boolean;
}): DecisionPago {
  const { evaluacion, refExterna } = p;
  if (evaluacion.tipo === "monto_incorrecto") {
    return { accion: "revisar", detalle: `pago ${refExterna} aprobado por $${evaluacion.monto}, distinto al abono` };
  }
  if (evaluacion.estado !== "aprobado") return { accion: "terminar", resultado: evaluacion.estado };
  if (p.estadoReserva === "confirmada" || p.estadoReserva === "completada" || p.pagoYaAprobado) {
    return { accion: "terminar", resultado: "ya_registrado" };
  }
  // Una solicitud rechazada por el dueño nunca se confirma sola, aunque llegue un pago.
  if (p.estadoReserva === "rechazada") {
    return { accion: "revisar", detalle: `pago ${refExterna} aprobado en una solicitud rechazada: reembolsar` };
  }
  return { accion: "confirmar" };
}

/** Motivo de revisión cuando no se pudo confirmar (decidido al intentar confirmar, dentro del cerrojo). */
export const detalleNoConfirmado = (refExterna: string, motivo: "bloqueo" | "traslape") =>
  motivo === "bloqueo"
    ? `pago ${refExterna} aprobado, pero el dueño bloqueó esas fechas: revisar o reembolsar`
    : `pago ${refExterna} aprobado después de vencer y las fechas ya están tomadas: reembolsar`;

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
