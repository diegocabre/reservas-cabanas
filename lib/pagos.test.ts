import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { armarPreferencia, evaluarPago, firmaValida } from "./pagos";

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
