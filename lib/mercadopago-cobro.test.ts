// registrarPagoMercadoPago con MERCADOPAGO_COBRO_ESTRICTO=true: un pago aprobado que no cobró la
// cuenta que corresponde queda para revisión y avisa al superadmin, una sola vez. API, base y correos simulados.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pago: {} as Record<string, unknown>,
  vendedor: "111" as string | null,
  notas: null as string | null,
  updates: [] as { data: Record<string, unknown> }[],
  upserts: 0,
  confirmaciones: 0,
  avisarSuperadmins: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  enviarEmails: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {
    constructor(public opciones: { accessToken: string }) {}
  },
  Payment: class {
    get = async () => m.pago;
  },
  Preference: class {},
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/emails", () => ({ enviarEmailsReservaConfirmada: m.enviarEmails }));
vi.mock("@/lib/notificaciones", () => ({ avisarSuperadmins: m.avisarSuperadmins }));
vi.mock("@/lib/mercadopago-cuentas", () => ({
  conexionDisponible: () => true,
  tokenDeVendedor: async (id: string) => (id === "111" || id === "222" ? `token-${id}` : null),
  tokenDePropiedad: async () => (m.vendedor ? "token-propiedad" : null),
}));
vi.mock("@/lib/db", () => {
  const reserva = () => ({
    id: "r1",
    codigo: "LL-7K3QX9",
    abono: 90_000,
    estado: "pendiente_pago",
    notas: m.notas,
    cabanaId: "c1",
    checkIn: new Date("2026-11-10T00:00:00Z"),
    checkOut: new Date("2026-11-13T00:00:00Z"),
    cabana: { propiedadId: "p1" },
  });
  return {
    db: {
      reserva: {
        findUnique: async () => reserva(),
        update: async (args: { data: { notas?: string } }) => {
          m.updates.push(args);
          if (args.data.notas !== undefined) m.notas = args.data.notas;
        },
      },
      cuentaMercadoPago: { findUnique: async () => (m.vendedor ? { mpUserId: m.vendedor } : null) },
      pago: { findUnique: async () => null, upsert: async () => void m.upserts++ },
      superadmin: { findMany: async () => [{ email: "plataforma@solucionesdys.cl" }] },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          $queryRaw: async () => [],
          bloqueo: { count: async () => 0 },
          reserva: { update: async () => void m.confirmaciones++ },
        }),
    },
  };
});

import { registrarPagoMercadoPago } from "./mercadopago";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token-plataforma");
  vi.stubEnv("RESERVAS_MODO_PRUEBA", "false");
  vi.stubEnv("MERCADOPAGO_COBRO_ESTRICTO", "true");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.vendedor = "111";
  m.notas = null;
  m.updates = [];
  m.upserts = 0;
  m.confirmaciones = 0;
  m.pago = { id: 555, status: "approved", external_reference: "LL-7K3QX9", transaction_amount: 90_000, currency_id: "CLP", collector_id: 111 };
});

describe("cobro estricto", () => {
  it("cobrado por la cuenta conectada: confirma igual que siempre", async () => {
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("confirmada");
    expect(m.confirmaciones).toBe(1);
    expect(m.avisarSuperadmins).not.toHaveBeenCalled();
  });

  it("cobrado por otra cuenta: revisión, sin registrar el pago ni confirmar, y aviso al superadmin una sola vez", async () => {
    m.pago = { ...m.pago, collector_id: 222 };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "222" })).toBe("revisar");
    expect(m.upserts).toBe(0);
    expect(m.confirmaciones).toBe(0);
    expect(m.notas).toBe("[REVISAR PAGO] pago 555 cobrado por otra cuenta de Mercado Pago: revisar");
    expect(m.avisarSuperadmins).toHaveBeenCalledTimes(1);
    expect(m.avisarSuperadmins.mock.calls[0][0]).toEqual(["plataforma@solucionesdys.cl"]);

    // Reintento del mismo aviso (o el regreso a la página): no repite la marca ni el correo.
    expect(await registrarPagoMercadoPago("555", { mpUserId: "222" })).toBe("revisar");
    expect(m.updates).toHaveLength(1);
    expect(m.avisarSuperadmins).toHaveBeenCalledTimes(1);
  });

  it("propiedad sin cuenta conectada, fuera del modo prueba: un pago de otra cuenta queda para revisión", async () => {
    m.vendedor = null;
    m.pago = { ...m.pago, collector_id: 222 };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "222" })).toBe("revisar");
    expect(m.confirmaciones).toBe(0);
  });

  it("propiedad sin cuenta conectada, en modo prueba, pago de la cuenta de la plataforma: confirma", async () => {
    vi.stubEnv("RESERVAS_MODO_PRUEBA", "true");
    m.vendedor = null;
    m.pago = { ...m.pago, collector_id: 333 };
    expect(await registrarPagoMercadoPago("555", { codigo: "LL-7K3QX9" })).toBe("confirmada");
  });

  it("pago pendiente de otra cuenta: se ignora sin dejar marca", async () => {
    m.pago = { ...m.pago, collector_id: 222, status: "pending" };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "222" })).toBe("ignorado");
    expect(m.updates).toEqual([]);
    expect(m.avisarSuperadmins).not.toHaveBeenCalled();
  });

  it("con el interruptor apagado, un pago de otra cuenta se ignora como antes", async () => {
    vi.stubEnv("MERCADOPAGO_COBRO_ESTRICTO", "false");
    m.pago = { ...m.pago, collector_id: 222 };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "222" })).toBe("ignorado");
    expect(m.updates).toEqual([]);
  });
});
