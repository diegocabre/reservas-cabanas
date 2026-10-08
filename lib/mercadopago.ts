import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { after } from "next/server";
import { db } from "@/lib/db";
import { enviarEmailsReservaConfirmada } from "@/lib/emails";
import { reservaOcupa } from "@/lib/disponibilidad";
import { codigoPostgres, TRASLAPE_RESERVA } from "@/lib/errores-db";
import { armarPreferencia, evaluarPago } from "@/lib/pagos";
import { enModoPrueba, urlDelSitio } from "@/lib/sitio";

// Por ahora una sola cuenta (variable de entorno). Con varias propiedades en producción, cada
// propiedad debe cobrar en su propia cuenta de Mercado Pago (ver CLAUDE.md).
function cliente() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN en el entorno");
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10_000 } });
}

/** ¿Está configurado el pago en línea? Sin token, la confirmación no muestra el botón de pago. */
export function pagoEnLineaDisponible(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

export type ResultadoInicioPago = { ok: true; url: string } | { ok: false; error: string };

/** Crea la preferencia de pago del abono y devuelve la URL de Checkout Pro. */
export async function iniciarPagoAbono(codigo: string): Promise<ResultadoInicioPago> {
  const reserva = await db.reserva.findUnique({
    where: { codigo },
    select: {
      codigo: true,
      abono: true,
      estado: true,
      expiraEn: true,
      huespedEmail: true,
      cabana: { select: { nombre: true } },
    },
  });
  if (!reserva) return { ok: false, error: "No encontramos esa reserva." };
  if (reserva.estado !== "pendiente_pago") return { ok: false, error: "Esta reserva no tiene un pago pendiente." };
  if (!reserva.expiraEn || !reservaOcupa(reserva, new Date())) {
    return { ok: false, error: "El plazo para pagar el abono terminó y las fechas se liberaron." };
  }

  const preferencia = await new Preference(cliente()).create({
    body: armarPreferencia({
      codigo: reserva.codigo,
      cabana: reserva.cabana.nombre,
      abono: reserva.abono,
      emailHuesped: enModoPrueba() ? null : reserva.huespedEmail,
      expiraEn: reserva.expiraEn,
      urlSitio: urlDelSitio(),
    }),
  });
  const url = preferencia.init_point;
  if (!url) return { ok: false, error: "Mercado Pago no devolvió el enlace de pago. Intenta de nuevo." };
  return { ok: true, url };
}

export type ResultadoRegistroPago =
  | "confirmada" // pago aprobado y reserva confirmada
  | "ya_registrado"
  | "pendiente"
  | "rechazado"
  | "revisar" // pago aprobado que no se pudo aplicar (monto distinto o fechas ya tomadas)
  | "ignorado";

const MARCA_REVISAR = "[REVISAR PAGO]";

/**
 * Consulta un pago a la API de Mercado Pago (nunca le cree al aviso ni a los parámetros de la URL)
 * y lo aplica a su reserva. Es idempotente: el mismo pago puede llegar varias veces.
 */
export async function registrarPagoMercadoPago(paymentId: string): Promise<ResultadoRegistroPago> {
  const pago = await new Payment(cliente()).get({ id: paymentId });
  const codigo = pago.external_reference;
  if (!codigo) return "ignorado";

  const reserva = await db.reserva.findUnique({
    where: { codigo },
    select: { id: true, codigo: true, abono: true, estado: true, notas: true },
  });
  if (!reserva) return "ignorado";

  const evaluacion = evaluarPago(pago, reserva);
  if (evaluacion.tipo === "ajeno") return "ignorado";

  const refExterna = String(pago.id ?? paymentId);
  const estadoPago = evaluacion.tipo === "valido" ? evaluacion.estado : "aprobado";
  const datosPago = {
    monto: evaluacion.monto,
    estado: estadoPago,
    pagadoEn: estadoPago === "aprobado" && pago.date_approved ? new Date(pago.date_approved) : null,
  } as const;

  const existente = await db.pago.findUnique({
    where: { proveedor_refExterna: { proveedor: "mercadopago", refExterna } },
    select: { estado: true },
  });
  await db.pago.upsert({
    where: { proveedor_refExterna: { proveedor: "mercadopago", refExterna } },
    create: { reservaId: reserva.id, proveedor: "mercadopago", refExterna, ...datosPago },
    update: datosPago,
  });

  if (evaluacion.tipo === "monto_incorrecto") {
    await anotarRevision(reserva.id, reserva.notas, `pago ${refExterna} aprobado por $${evaluacion.monto}, distinto al abono`);
    return "revisar";
  }
  if (evaluacion.estado !== "aprobado") return evaluacion.estado;
  if (reserva.estado === "confirmada" || reserva.estado === "completada" || existente?.estado === "aprobado") {
    return "ya_registrado";
  }

  // Pago aprobado: confirmar. Si la reserva se había cancelado por vencer, se intenta reactivar;
  // si mientras tanto otra reserva tomó esas fechas, Postgres lo impide y queda para revisión.
  try {
    await db.reserva.update({ where: { id: reserva.id }, data: { estado: "confirmada", expiraEn: null } });
    // Solo aquí la reserva pasa a confirmada, así que el email sale una sola vez.
    // after(): se envía después de responder, sin demorar la página ni el webhook.
    after(() => enviarEmailsReservaConfirmada(reserva.codigo));
    return "confirmada";
  } catch (e) {
    if (codigoPostgres(e) !== TRASLAPE_RESERVA) throw e;
    await anotarRevision(reserva.id, reserva.notas, `pago ${refExterna} aprobado después de vencer y las fechas ya están tomadas: reembolsar`);
    return "revisar";
  }
}

async function anotarRevision(reservaId: string, notas: string | null, detalle: string) {
  const linea = `${MARCA_REVISAR} ${detalle}`;
  if (notas?.includes(linea)) return;
  await db.reserva.update({ where: { id: reservaId }, data: { notas: [notas, linea].filter(Boolean).join("\n") } });
}
