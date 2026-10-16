import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  aceptarAviso,
  armarPreferencia,
  cobroDeLaCuentaEsperada,
  cobroEstricto,
  decidirEstadoPago,
  detalleNoConfirmado,
  evaluarPago,
  firmaValida,
  revisarFirmaAviso,
  verificarCuentaCobro,
  webhookEstricto,
} from "./pagos";

const datos = {
  codigo: "LL-0007",
  cabana: "Cabaña Volcán Osorno",
  abono: 112_500,
  emailHuesped: "ana@example.com",
  expiraEn: new Date("2026-10-20T18:30:00Z"),
};

describe("armarPreferencia", () => {
  it("cobra el abono exacto en CLP y referencia la reserva por su código", () => {
    const p = armarPreferencia({ ...datos, urlSitio: new URL("https://reservas.example.cl") });
    expect(p.items).toEqual([
      { id: "LL-0007", title: "Abono reserva LL-0007 · Cabaña Volcán Osorno", quantity: 1, unit_price: 112_500, currency_id: "CLP" },
    ]);
    expect(p.external_reference).toBe("LL-0007");
    expect(p.payer).toEqual({ email: "ana@example.com" });
  });

  it("sin email no prellena al pagador (modo prueba)", () => {
    const p = armarPreferencia({ ...datos, emailHuesped: null, urlSitio: new URL("https://reservas.example.cl") });
    expect(p).not.toHaveProperty("payer");
  });

  it("expira junto con la reserva", () => {
    const p = armarPreferencia({ ...datos, urlSitio: new URL("https://reservas.example.cl") });
    expect(p).toMatchObject({ expires: true, expiration_date_to: "2026-10-20T18:30:00.000Z" });
  });

  it("con https vuelve a la confirmación y avisa al webhook", () => {
    const p = armarPreferencia({ ...datos, urlSitio: new URL("https://reservas.example.cl") });
    expect(p.back_urls.success).toBe("https://reservas.example.cl/reserva/LL-0007");
    expect(p).toMatchObject({
      auto_return: "approved",
      notification_url: "https://reservas.example.cl/api/webhooks/mercadopago",
    });
  });

  it("en localhost no configura webhook ni regreso automático", () => {
    const p = armarPreferencia({ ...datos, urlSitio: new URL("http://localhost:3000") });
    expect(p.back_urls.success).toBe("http://localhost:3000/reserva/LL-0007");
    expect(p).not.toHaveProperty("notification_url");
    expect(p).not.toHaveProperty("auto_return");
  });
});

describe("evaluarPago", () => {
  const reserva = { codigo: "LL-0007", abono: 112_500 };
  const pago = (extra: object) => ({ external_reference: "LL-0007", currency_id: "CLP", transaction_amount: 112_500, ...extra });

  it("aprueba solo el abono exacto en CLP", () => {
    expect(evaluarPago(pago({ status: "approved" }), reserva)).toEqual({ tipo: "valido", estado: "aprobado", monto: 112_500 });
  });

  it("no confirma por un monto o moneda distintos", () => {
    expect(evaluarPago(pago({ status: "approved", transaction_amount: 1_000 }), reserva)).toEqual({
      tipo: "monto_incorrecto",
      monto: 1_000,
    });
    expect(evaluarPago(pago({ status: "approved", currency_id: "USD" }), reserva).tipo).toBe("monto_incorrecto");
  });

  it("ignora pagos de otra reserva", () => {
    expect(evaluarPago(pago({ status: "approved", external_reference: "LL-0008" }), reserva)).toEqual({ tipo: "ajeno" });
  });

  it("mapea pendientes y rechazados", () => {
    expect(evaluarPago(pago({ status: "in_process" }), reserva)).toMatchObject({ estado: "pendiente" });
    expect(evaluarPago(pago({ status: "rejected" }), reserva)).toMatchObject({ estado: "rechazado" });
    expect(evaluarPago(pago({ status: "refunded" }), reserva)).toMatchObject({ estado: "rechazado" });
  });
});

describe("firmaValida", () => {
  const secreto = "secreto-de-prueba";
  const firmar = (plantilla: string) => createHmac("sha256", secreto).update(plantilla).digest("hex");

  it("acepta una firma correcta", () => {
    const v1 = firmar("id:123456;request-id:abc-1;ts:1700000000;");
    expect(firmaValida({ secreto, firma: `ts=1700000000,v1=${v1}`, requestId: "abc-1", dataId: "123456" })).toBe(true);
  });

  it("rechaza firmas alteradas, ausentes o de otro pago", () => {
    const v1 = firmar("id:123456;request-id:abc-1;ts:1700000000;");
    expect(firmaValida({ secreto, firma: `ts=1700000000,v1=${v1}`, requestId: "abc-1", dataId: "999" })).toBe(false);
    expect(firmaValida({ secreto, firma: `ts=1700000001,v1=${v1}`, requestId: "abc-1", dataId: "123456" })).toBe(false);
    expect(firmaValida({ secreto, firma: null, requestId: "abc-1", dataId: "123456" })).toBe(false);
    expect(firmaValida({ secreto, firma: "basura", requestId: "abc-1", dataId: "123456" })).toBe(false);
  });
});

describe("cobroDeLaCuentaEsperada", () => {
  it("acepta solo pagos cobrados por la cuenta conectada de la propiedad", () => {
    expect(cobroDeLaCuentaEsperada(123456, "123456")).toBe(true);
    expect(cobroDeLaCuentaEsperada("123456", "123456")).toBe(true);
    expect(cobroDeLaCuentaEsperada(999999, "123456")).toBe(false); // pago a otra cuenta con el código de esta reserva
    expect(cobroDeLaCuentaEsperada(undefined, "123456")).toBe(false);
  });

  it("sin cuenta conectada (cuenta de la plataforma, modo prueba) no hay vendedor que comparar", () => {
    expect(cobroDeLaCuentaEsperada(999999, null)).toBe(true);
  });
});

describe("decidirEstadoPago", () => {
  const aprobado = { tipo: "valido", estado: "aprobado", monto: 90_000 } as const;
  const base = { evaluacion: aprobado, refExterna: "555", estadoReserva: "pendiente_pago", pagoYaAprobado: false };

  it("pago aprobado de una reserva por pagar: confirmar", () => {
    for (const estadoReserva of ["pendiente_pago", "cancelada", "expirada", "aprobada_pendiente_pago", "pendiente_aprobacion"]) {
      expect(decidirEstadoPago({ ...base, estadoReserva })).toEqual({ accion: "confirmar" });
    }
  });

  it("monto incorrecto: revisión con el monto pagado", () => {
    expect(decidirEstadoPago({ ...base, evaluacion: { tipo: "monto_incorrecto", monto: 1_000 } })).toEqual({
      accion: "revisar",
      detalle: "pago 555 aprobado por $1000, distinto al abono",
    });
  });

  it("pendiente o rechazado: termina con ese resultado, sin tocar la reserva", () => {
    expect(decidirEstadoPago({ ...base, evaluacion: { tipo: "valido", estado: "pendiente", monto: 0 } })).toEqual({ accion: "terminar", resultado: "pendiente" });
    expect(decidirEstadoPago({ ...base, evaluacion: { tipo: "valido", estado: "rechazado", monto: 0 } })).toEqual({ accion: "terminar", resultado: "rechazado" });
  });

  it("ya confirmada, completada o pago ya aprobado antes: ya_registrado", () => {
    expect(decidirEstadoPago({ ...base, estadoReserva: "confirmada" })).toEqual({ accion: "terminar", resultado: "ya_registrado" });
    expect(decidirEstadoPago({ ...base, estadoReserva: "completada" })).toEqual({ accion: "terminar", resultado: "ya_registrado" });
    expect(decidirEstadoPago({ ...base, pagoYaAprobado: true })).toEqual({ accion: "terminar", resultado: "ya_registrado" });
  });

  it("solicitud rechazada: revisión para reembolsar", () => {
    expect(decidirEstadoPago({ ...base, estadoReserva: "rechazada" })).toEqual({
      accion: "revisar",
      detalle: "pago 555 aprobado en una solicitud rechazada: reembolsar",
    });
  });

  it("textos de bloqueo y traslape", () => {
    expect(detalleNoConfirmado("555", "bloqueo")).toBe("pago 555 aprobado, pero el dueño bloqueó esas fechas: revisar o reembolsar");
    expect(detalleNoConfirmado("555", "traslape")).toBe("pago 555 aprobado después de vencer y las fechas ya están tomadas: reembolsar");
  });
});

describe("interruptores", () => {
  it("webhook estricto solo con la variable en true y fuera del modo prueba", () => {
    expect(webhookEstricto(false, {})).toBe(false);
    expect(webhookEstricto(false, { MERCADOPAGO_WEBHOOK_STRICT: "true" })).toBe(true);
    expect(webhookEstricto(true, { MERCADOPAGO_WEBHOOK_STRICT: "true" })).toBe(false);
    expect(webhookEstricto(false, { MERCADOPAGO_WEBHOOK_STRICT: "1" })).toBe(false);
  });
  it("cobro estricto solo con la variable en true", () => {
    expect(cobroEstricto({})).toBe(false);
    expect(cobroEstricto({ MERCADOPAGO_COBRO_ESTRICTO: "true" })).toBe(true);
  });
});

describe("firma del aviso", () => {
  const secreto = "clave-webhook";
  const firmar = (dataId: string, requestId: string, ts: string) =>
    `ts=${ts},v1=${createHmac("sha256", secreto).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex")}`;

  it("revisarFirmaAviso distingue sin secreto, sin firma, inválida y válida", () => {
    expect(revisarFirmaAviso({ secreto: undefined, firma: "x", requestId: "r", dataId: "1" })).toBe("sin_secreto");
    expect(revisarFirmaAviso({ secreto, firma: null, requestId: "r", dataId: "1" })).toBe("sin_firma");
    expect(revisarFirmaAviso({ secreto, firma: "ts=1,v1=abcd", requestId: "r", dataId: "1" })).toBe("invalida");
    expect(revisarFirmaAviso({ secreto, firma: firmar("1", "r", "9"), requestId: "r", dataId: "1" })).toBe("valida");
  });

  it.each([
    ["valida", false, true],
    ["valida", true, true],
    ["sin_secreto", false, true], // como antes: sin secreto se procesa (con log)
    ["sin_secreto", true, false],
    ["sin_firma", false, false], // como antes: con secreto, sin firma se rechaza
    ["sin_firma", true, false],
    ["invalida", false, false],
    ["invalida", true, false],
  ] as const)("aceptarAviso(%s, estricto=%s) = %s", (firma, estricto, esperado) => {
    expect(aceptarAviso(firma, estricto)).toBe(esperado);
  });
});

describe("verificarCuentaCobro", () => {
  const casos: { conectada: boolean; prueba: boolean; coincide: boolean; origen: "vendedor" | "propiedad" | "plataforma" }[] = [];
  for (const conectada of [true, false])
    for (const prueba of [true, false])
      for (const coincide of [true, false])
        for (const origen of ["vendedor", "propiedad", "plataforma"] as const) casos.push({ conectada, prueba, coincide, origen });

  const llamar = (c: (typeof casos)[number], estricto: boolean, aprobado = true) =>
    verificarCuentaCobro({
      collectorId: c.coincide ? 111 : 222,
      vendedorEsperado: c.conectada ? "111" : null,
      origenConsulta: c.origen,
      modoPrueba: c.prueba,
      estricto,
      aprobado,
    });

  it.each(casos)("sin modo estricto replica la regla anterior: %o", (c) => {
    expect(llamar(c, false)).toBe(!c.conectada || c.coincide ? "ok" : "ignorar");
  });

  it.each(casos)("modo estricto: %o", (c) => {
    const cumple = c.conectada ? c.coincide : c.origen === "plataforma" && c.prueba;
    expect(llamar(c, true)).toBe(cumple ? "ok" : "revisar");
    // Un pago no aprobado que no cumple no deja marca: se ignora.
    expect(llamar(c, true, false)).toBe(cumple ? "ok" : "ignorar");
  });
});
