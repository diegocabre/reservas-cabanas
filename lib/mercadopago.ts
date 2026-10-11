import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { after } from "next/server";
import { db } from "@/lib/db";
import { enviarEmailsReservaConfirmada } from "@/lib/emails";
import { reservaOcupa } from "@/lib/disponibilidad";
import { cerrojoCabana, codigoPostgres, TRASLAPE_RESERVA } from "@/lib/errores-db";
import { conexionDisponible, tokenDePropiedad, tokenDeVendedor } from "@/lib/mercadopago-cuentas";
import { elegirCredencial } from "@/lib/mercadopago-oauth";
import { armarPreferencia, cobroDeLaCuentaEsperada, evaluarPago, MARCA_REVISAR } from "@/lib/pagos";
import { bloqueoCobro, SELECT_PUBLICACION } from "@/lib/publicacion";
import { enModoPrueba, urlDelSitio } from "@/lib/sitio";

// Cada propiedad cobra con SU cuenta de Mercado Pago, conectada por el dueño (lib/mercadopago-cuentas.ts):
// el dinero del huésped llega al dueño, nunca a Soluciones DyS. La cuenta de la plataforma
// (MERCADOPAGO_ACCESS_TOKEN) solo cobra en modo prueba, para propiedades sin cuenta conectada.
function cliente(accessToken: string) {
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10_000 } });
}

/** Con qué cuenta se cobra el abono de una propiedad (lib/mercadopago-oauth.ts → elegirCredencial). */
async function credencialDePropiedad(propiedadId: string) {
  return elegirCredencial({
    tokenPropiedad: conexionDisponible() ? await tokenDePropiedad(propiedadId) : null,
    tokenPlataforma: process.env.MERCADOPAGO_ACCESS_TOKEN,
    modoPrueba: enModoPrueba(),
  });
}

/** ¿Esta propiedad puede cobrar el abono en línea? Sin cuenta, la confirmación no muestra el botón de pago. */
export async function puedeCobrarEnLinea(propiedadId: string): Promise<boolean> {
  return (await credencialDePropiedad(propiedadId)).ok;
}

/** Id de vendedor de la cuenta conectada de la propiedad, o null si cobra con la de la plataforma. */
async function vendedorDePropiedad(propiedadId: string): Promise<string | null> {
  const cuenta = await db.cuentaMercadoPago.findUnique({ where: { propiedadId }, select: { mpUserId: true } });
  return cuenta?.mpUserId ?? null;
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
      cabana: { select: { nombre: true, demo: true, propiedad: { select: { id: true, ...SELECT_PUBLICACION } } } },
    },
  });
  if (!reserva) return { ok: false, error: "No encontramos esa reserva." };
  // Las cabañas demo nunca cobran; las con datos PENDIENTE solo en modo prueba.
  const bloqueo = bloqueoCobro(reserva.cabana, enModoPrueba());
  if (bloqueo) return { ok: false, error: bloqueo };
  if (reserva.estado !== "pendiente_pago") return { ok: false, error: "Esta reserva no tiene un pago pendiente." };
  if (!reserva.expiraEn || !reservaOcupa(reserva, new Date())) {
    return { ok: false, error: "El plazo para pagar el abono terminó y las fechas se liberaron." };
  }

  const credencial = await credencialDePropiedad(reserva.cabana.propiedad.id);
  if (!credencial.ok) return credencial;

  // Se cobra el abono guardado en la reserva, calculado al crearla con calcularAbono (lib/precios.ts).
  // El webhook confirma solo si se pagó exactamente ese monto (evaluarPago).
  const preferencia = await new Preference(cliente(credencial.credencial.accessToken)).create({
    body: armarPreferencia({
      codigo: reserva.codigo,
      cabana: reserva.cabana.nombre,
      abono: reserva.abono,
      emailHuesped: enModoPrueba() ? null : reserva.huespedEmail,
      expiraEn: reserva.expiraEn,
      urlSitio: urlDelSitio(),
    }),
  });
  // Siempre init_point. Las credenciales "de prueba" de Mercado Pago pertenecen a un vendedor de
  // prueba (test_user) y funcionan con el checkout normal; sandbox_init_point falla con ellas.
  // Para probar, el comprador también debe ser un usuario de prueba.
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

/**
 * Token con el que se consulta un pago: el del vendedor que indica el aviso (user_id), o el de la
 * propiedad de la reserva (al volver de Mercado Pago), o el de la plataforma (modo prueba).
 */
async function tokenParaConsultar(pista: { mpUserId?: string | null; codigo?: string }): Promise<string | null> {
  if (pista.mpUserId && conexionDisponible()) {
    const token = await tokenDeVendedor(pista.mpUserId);
    if (token) return token;
  }
  if (pista.codigo) {
    const reserva = await db.reserva.findUnique({
      where: { codigo: pista.codigo },
      select: { cabana: { select: { propiedadId: true } } },
    });
    if (reserva) {
      const credencial = await credencialDePropiedad(reserva.cabana.propiedadId);
      if (credencial.ok) return credencial.credencial.accessToken;
    }
  }
  return process.env.MERCADOPAGO_ACCESS_TOKEN ?? null;
}

/**
 * Consulta un pago a la API de Mercado Pago (nunca le cree al aviso ni a los parámetros de la URL)
 * y lo aplica a su reserva. Es idempotente: el mismo pago puede llegar varias veces.
 * `pista` dice con qué cuenta consultarlo: el user_id del aviso o el código de la reserva.
 */
export async function registrarPagoMercadoPago(
  paymentId: string,
  pista: { mpUserId?: string | null; codigo?: string } = {},
): Promise<ResultadoRegistroPago> {
  const token = await tokenParaConsultar(pista);
  if (!token) return "ignorado";
  const pago = await new Payment(cliente(token)).get({ id: paymentId });
  const codigo = pago.external_reference;
  if (!codigo) return "ignorado";

  const reserva = await db.reserva.findUnique({
    where: { codigo },
    select: { id: true, codigo: true, abono: true, estado: true, notas: true, cabanaId: true, checkIn: true, checkOut: true, cabana: { select: { propiedadId: true } } },
  });
  if (!reserva) return "ignorado";

  // El pago debe haberlo cobrado la cuenta de ESTA propiedad: un pago a otra cuenta con el código de
  // esta reserva (por ejemplo, de otro dueño) no la confirma.
  if (!cobroDeLaCuentaEsperada(pago.collector_id, await vendedorDePropiedad(reserva.cabana.propiedadId))) {
    console.warn("Pago de Mercado Pago cobrado por otra cuenta", { paymentId, codigo });
    return "ignorado";
  }

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
    const bloqueada = await db.$transaction(async (tx) => {
      // Mismo cerrojo que la reserva web y los bloqueos: si el dueño bloqueó esas fechas después de
      // que la reserva venció, el pago no la reactiva encima del bloqueo.
      await cerrojoCabana(tx, reserva.cabanaId);
      const bloqueos = await tx.bloqueo.count({
        where: { cabanaId: reserva.cabanaId, desde: { lt: reserva.checkOut }, hasta: { gt: reserva.checkIn } },
      });
      if (bloqueos > 0) return true;
      await tx.reserva.update({ where: { id: reserva.id }, data: { estado: "confirmada", expiraEn: null } });
      return false;
    });
    if (bloqueada) {
      await anotarRevision(reserva.id, reserva.notas, `pago ${refExterna} aprobado, pero el dueño bloqueó esas fechas: revisar o reembolsar`);
      return "revisar";
    }
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
