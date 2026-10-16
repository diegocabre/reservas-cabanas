import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ registrar: vi.fn(), esVendedorConectado: vi.fn() }));
vi.mock("@/lib/mercadopago", () => ({ registrarPagoMercadoPago: m.registrar }));
vi.mock("@/lib/mercadopago-cuentas", () => ({ esVendedorConectado: m.esVendedorConectado }));

import { POST } from "./route";

const SECRETO = "clave-webhook";
function aviso({ firma, userId = "111" }: { firma?: "valida" | "invalida"; userId?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json", "x-request-id": "req-1" });
  if (firma) {
    const ts = "1700000000";
    const v1 = firma === "valida" ? createHmac("sha256", SECRETO).update(`id:555;request-id:req-1;ts:${ts};`).digest("hex") : "00".repeat(32);
    headers.set("x-signature", `ts=${ts},v1=${v1}`);
  }
  return new Request("https://reservas.example.cl/api/webhooks/mercadopago?data.id=555&type=payment", {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "payment", data: { id: "555" }, user_id: userId }),
  });
}

let avisos: string[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("RESERVAS_MODO_PRUEBA", "false");
  m.registrar.mockResolvedValue("confirmada");
  m.esVendedorConectado.mockResolvedValue(true);
  avisos = [];
  vi.spyOn(console, "warn").mockImplementation((t: string) => void avisos.push(t));
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("webhook de Mercado Pago, sin modo estricto (por defecto)", () => {
  it("sin secreto configurado: procesa como antes y deja el log webhook_firma_invalida", async () => {
    const r = await POST(aviso());
    expect(r.status).toBe(200);
    expect(m.registrar).toHaveBeenCalledWith("555", { mpUserId: "111" });
    expect(JSON.parse(avisos[0])).toEqual({ evento: "webhook_firma_invalida", motivo: "sin_secreto", estricto: false, id: "555" });
  });

  it("con secreto y firma válida: procesa sin log", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    expect((await POST(aviso({ firma: "valida" }))).status).toBe(200);
    expect(m.registrar).toHaveBeenCalled();
    expect(avisos).toEqual([]);
  });

  it("con secreto y firma inválida o ausente: 401, como antes", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    expect((await POST(aviso({ firma: "invalida" }))).status).toBe(401);
    expect((await POST(aviso())).status).toBe(401);
    expect(m.registrar).not.toHaveBeenCalled();
  });

  it("user_id desconocido: sigue igual que antes (no se consulta la base)", async () => {
    m.esVendedorConectado.mockResolvedValue(false);
    expect((await POST(aviso({ userId: "999" }))).status).toBe(200);
    expect(m.esVendedorConectado).not.toHaveBeenCalled();
    expect(m.registrar).toHaveBeenCalledWith("555", { mpUserId: "999" });
  });

  it("los logs no llevan tokens ni datos personales", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "APP_USR-secreto");
    await POST(aviso());
    expect(avisos.join(" ")).not.toMatch(/APP_USR|@/);
  });
});

describe("webhook con MERCADOPAGO_WEBHOOK_STRICT=true", () => {
  beforeEach(() => vi.stubEnv("MERCADOPAGO_WEBHOOK_STRICT", "true"));

  it("sin secreto configurado: 401", async () => {
    expect((await POST(aviso())).status).toBe(401);
    expect(m.registrar).not.toHaveBeenCalled();
  });

  it("firma inválida: 401", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    expect((await POST(aviso({ firma: "invalida" }))).status).toBe(401);
  });

  it("firma válida y vendedor conectado: procesa", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    expect((await POST(aviso({ firma: "valida" }))).status).toBe(200);
    expect(m.esVendedorConectado).toHaveBeenCalledWith("111");
    expect(m.registrar).toHaveBeenCalled();
  });

  it("user_id que no es una cuenta conectada: responde 200 sin consultar el pago y deja log", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO);
    m.esVendedorConectado.mockResolvedValue(false);
    const r = await POST(aviso({ firma: "valida", userId: "999" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, ignorado: true });
    expect(m.registrar).not.toHaveBeenCalled();
    expect(avisos.some((a) => a.includes("webhook_vendedor_desconocido"))).toBe(true);
  });

  it("en modo prueba no aplica: sin secreto procesa como antes", async () => {
    vi.stubEnv("RESERVAS_MODO_PRUEBA", "true");
    expect((await POST(aviso())).status).toBe(200);
    expect(m.registrar).toHaveBeenCalled();
  });
});
