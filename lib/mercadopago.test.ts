// Tests de caracterización de registrarPagoMercadoPago: fijan el comportamiento actual (cómo queda la
// reserva según el pago) con la API de Mercado Pago, la base y los correos simulados. Ningún cobro real.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pagoApi: {} as Record<string, unknown>,
  pagoGet: vi.fn(),
  tokenDeVendedor: vi.fn(),
  tokenDePropiedad: vi.fn(),
  conexionDisponible: vi.fn(),
  enviarEmails: vi.fn(),
  after: vi.fn(),
  db: {} as Record<string, unknown>,
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {
    constructor(public opciones: { accessToken: string }) {}
  },
  Payment: class {
    constructor(private config: { opciones: { accessToken: string } }) {}
    get(args: { id: string }) {
      return m.pagoGet({ ...args, token: this.config.opciones.accessToken });
    }
  },
  Preference: class {},
}));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("@/lib/emails", () => ({ enviarEmailsReservaConfirmada: m.enviarEmails }));
vi.mock("@/lib/mercadopago-cuentas", () => ({
  conexionDisponible: m.conexionDisponible,
  tokenDeVendedor: m.tokenDeVendedor,
  tokenDePropiedad: m.tokenDePropiedad,
}));
vi.mock("@/lib/db", () => ({ db: m.db }));

import { registrarPagoMercadoPago } from "./mercadopago";

type Reserva = {
  id: string;
  codigo: string;
  abono: number;
  estado: string;
  notas: string | null;
  cabanaId: string;
  checkIn: Date;
  checkOut: Date;
  cabana: { propiedadId: string };
};

let reserva: Reserva | null;
let vendedor: string | null;
let pagoExistente: { estado: string } | null;
let bloqueos: number;
let errorAlConfirmar: unknown;
const escrituras = {
  upserts: [] as unknown[],
  updates: [] as { where: unknown; data: Record<string, unknown> }[],
  txUpdates: [] as { where: unknown; data: Record<string, unknown> }[],
};

function armarDb() {
  const tx = {
    $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    bloqueo: { count: vi.fn(async () => bloqueos) },
    reserva: {
      update: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        if (errorAlConfirmar) throw errorAlConfirmar;
        escrituras.txUpdates.push(args);
        return {};
      }),
    },
  };
  Object.assign(m.db, {
    reserva: {
      findUnique: vi.fn(async () => reserva),
      update: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        escrituras.updates.push(args);
        return {};
      }),
    },
    cuentaMercadoPago: { findUnique: vi.fn(async () => (vendedor ? { mpUserId: vendedor } : null)) },
    pago: {
      findUnique: vi.fn(async () => pagoExistente),
      upsert: vi.fn(async (args: unknown) => {
        escrituras.upserts.push(args);
        return {};
      }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  });
}

const errorTraslape = { meta: { driverAdapterError: { cause: { originalCode: "23P01" } } } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token-plataforma");
  vi.stubEnv("RESERVAS_MODO_PRUEBA", "false");
  reserva = {
    id: "r1",
    codigo: "LL-7K3QX9",
    abono: 90_000,
    estado: "pendiente_pago",
    notas: null,
    cabanaId: "c1",
    checkIn: new Date("2026-11-10T00:00:00Z"),
    checkOut: new Date("2026-11-13T00:00:00Z"),
    cabana: { propiedadId: "p1" },
  };
  vendedor = "111";
  pagoExistente = null;
  bloqueos = 0;
  errorAlConfirmar = undefined;
  escrituras.upserts = [];
  escrituras.updates = [];
  escrituras.txUpdates = [];
  m.pagoApi = {
    id: 555,
    status: "approved",
    external_reference: "LL-7K3QX9",
    transaction_amount: 90_000,
    currency_id: "CLP",
    collector_id: 111,
    date_approved: "2026-10-15T12:00:00.000-03:00",
  };
  m.pagoGet.mockImplementation(async () => m.pagoApi);
  m.conexionDisponible.mockReturnValue(true);
  m.tokenDeVendedor.mockImplementation(async (id: string) => (id === "111" ? "token-vendedor" : null));
  m.tokenDePropiedad.mockImplementation(async () => (vendedor ? "token-propiedad" : null));
  m.after.mockImplementation((fn: () => unknown) => void fn());
  armarDb();
});

describe("registrarPagoMercadoPago (caracterización)", () => {
  it("pago aprobado por el abono exacto: confirma la reserva, registra el pago y envía el correo una vez", async () => {
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("confirmada");
    expect(m.pagoGet).toHaveBeenCalledWith({ id: "555", token: "token-vendedor" });
    expect(escrituras.upserts).toEqual([
      {
        where: { proveedor_refExterna: { proveedor: "mercadopago", refExterna: "555" } },
        create: { reservaId: "r1", proveedor: "mercadopago", refExterna: "555", monto: 90_000, estado: "aprobado", pagadoEn: new Date("2026-10-15T15:00:00.000Z") },
        update: { monto: 90_000, estado: "aprobado", pagadoEn: new Date("2026-10-15T15:00:00.000Z") },
      },
    ]);
    expect(escrituras.txUpdates).toEqual([{ where: { id: "r1" }, data: { estado: "confirmada", expiraEn: null, avisoFallido: null } }]);
    expect(m.enviarEmails).toHaveBeenCalledTimes(1);
    expect(m.enviarEmails).toHaveBeenCalledWith("LL-7K3QX9");
  });

  it("al volver de Mercado Pago consulta con el token de la propiedad de la reserva", async () => {
    expect(await registrarPagoMercadoPago("555", { codigo: "LL-7K3QX9" })).toBe("confirmada");
    expect(m.pagoGet).toHaveBeenCalledWith({ id: "555", token: "token-propiedad" });
  });

  it("user_id desconocido: consulta con el token de la plataforma", async () => {
    m.pagoGet.mockImplementation(async () => ({ ...m.pagoApi, collector_id: 111 }));
    await registrarPagoMercadoPago("555", { mpUserId: "999" });
    expect(m.pagoGet).toHaveBeenCalledWith({ id: "555", token: "token-plataforma" });
  });

  it("sin ningún token: ignora", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", undefined as unknown as string);
    m.tokenDeVendedor.mockResolvedValue(null);
    expect(await registrarPagoMercadoPago("555", {})).toBe("ignorado");
    expect(m.pagoGet).not.toHaveBeenCalled();
  });

  it("pago sin external_reference o de una reserva que no existe: ignora sin escribir", async () => {
    m.pagoApi = { ...m.pagoApi, external_reference: undefined };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("ignorado");
    m.pagoApi = { ...m.pagoApi, external_reference: "LL-NOEXIS" };
    reserva = null;
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("ignorado");
    expect(escrituras.upserts).toEqual([]);
  });

  it("cobrado por otra cuenta que la conectada: ignora sin escribir", async () => {
    m.pagoApi = { ...m.pagoApi, collector_id: 222 };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("ignorado");
    expect(escrituras.upserts).toEqual([]);
    expect(escrituras.updates).toEqual([]);
    expect(escrituras.txUpdates).toEqual([]);
  });

  it("propiedad sin cuenta conectada: acepta el pago de cualquier cuenta (comportamiento actual)", async () => {
    vendedor = null;
    m.pagoApi = { ...m.pagoApi, collector_id: 222 };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("confirmada");
  });

  it("propiedad sin cuenta conectada en modo prueba: confirma con la cuenta de la plataforma", async () => {
    vi.stubEnv("RESERVAS_MODO_PRUEBA", "true");
    vendedor = null;
    m.pagoApi = { ...m.pagoApi, collector_id: 333 };
    expect(await registrarPagoMercadoPago("555", { codigo: "LL-7K3QX9" })).toBe("confirmada");
    expect(m.pagoGet).toHaveBeenCalledWith({ id: "555", token: "token-plataforma" });
  });

  it("monto distinto al abono: registra el pago aprobado y deja la reserva para revisión", async () => {
    m.pagoApi = { ...m.pagoApi, transaction_amount: 1_000 };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("revisar");
    expect(escrituras.upserts).toHaveLength(1);
    expect(escrituras.updates).toEqual([{ where: { id: "r1" }, data: { notas: "[REVISAR PAGO] pago 555 aprobado por $1000, distinto al abono" } }]);
    expect(escrituras.txUpdates).toEqual([]);
    expect(m.enviarEmails).not.toHaveBeenCalled();
  });

  it("moneda distinta de CLP: revisión", async () => {
    m.pagoApi = { ...m.pagoApi, currency_id: "USD" };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("revisar");
  });

  it("la marca de revisión se agrega a las notas existentes y no se repite", async () => {
    m.pagoApi = { ...m.pagoApi, transaction_amount: 1_000 };
    reserva!.notas = "Llegamos tarde\n[REVISAR PAGO] pago 555 aprobado por $1000, distinto al abono";
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("revisar");
    expect(escrituras.updates).toEqual([]);
    reserva!.notas = "Llegamos tarde";
    await registrarPagoMercadoPago("555", { mpUserId: "111" });
    expect(escrituras.updates[0].data.notas).toBe("Llegamos tarde\n[REVISAR PAGO] pago 555 aprobado por $1000, distinto al abono");
  });

  it.each([
    ["pending", "pendiente"],
    ["in_process", "pendiente"],
    ["rejected", "rechazado"],
    ["refunded", "rechazado"],
  ])("pago %s: registra el pago como %s y no cambia la reserva", async (status, esperado) => {
    m.pagoApi = { ...m.pagoApi, status };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe(esperado);
    expect((escrituras.upserts[0] as { update: { estado: string; pagadoEn: unknown } }).update).toMatchObject({ estado: esperado, pagadoEn: null });
    expect(escrituras.txUpdates).toEqual([]);
  });

  it("pago duplicado (reintento del aviso): ya_registrado, sin cambiar la reserva ni reenviar correo", async () => {
    pagoExistente = { estado: "aprobado" };
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("ya_registrado");
    expect(escrituras.txUpdates).toEqual([]);
    expect(m.enviarEmails).not.toHaveBeenCalled();
  });

  it.each(["confirmada", "completada"])("reserva ya %s: ya_registrado", async (estado) => {
    reserva!.estado = estado;
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("ya_registrado");
    expect(escrituras.txUpdates).toEqual([]);
  });

  it("solicitud rechazada por el dueño: no se confirma, queda para reembolsar", async () => {
    reserva!.estado = "rechazada";
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("revisar");
    expect(escrituras.updates[0].data.notas).toBe("[REVISAR PAGO] pago 555 aprobado en una solicitud rechazada: reembolsar");
    expect(escrituras.txUpdates).toEqual([]);
  });

  it.each(["cancelada", "expirada", "aprobada_pendiente_pago", "pendiente_aprobacion"])("reserva %s con fechas libres: se confirma", async (estado) => {
    reserva!.estado = estado;
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("confirmada");
  });

  it("el dueño bloqueó esas fechas: no confirma, queda para revisión", async () => {
    bloqueos = 1;
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("revisar");
    expect(escrituras.txUpdates).toEqual([]);
    expect(escrituras.updates[0].data.notas).toBe("[REVISAR PAGO] pago 555 aprobado, pero el dueño bloqueó esas fechas: revisar o reembolsar");
    expect(m.enviarEmails).not.toHaveBeenCalled();
  });

  it("otra reserva tomó las fechas (traslape): queda para reembolsar", async () => {
    errorAlConfirmar = errorTraslape;
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("revisar");
    expect(escrituras.updates[0].data.notas).toBe("[REVISAR PAGO] pago 555 aprobado después de vencer y las fechas ya están tomadas: reembolsar");
    expect(m.enviarEmails).not.toHaveBeenCalled();
  });

  it("otro error de la base al confirmar: se propaga (el webhook responde 500 y Mercado Pago reintenta)", async () => {
    errorAlConfirmar = new Error("conexión perdida");
    await expect(registrarPagoMercadoPago("555", { mpUserId: "111" })).rejects.toThrow("conexión perdida");
  });

  it("el mismo aviso dos veces: el segundo no duplica estado ni correo", async () => {
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("confirmada");
    pagoExistente = { estado: "aprobado" };
    reserva!.estado = "confirmada";
    expect(await registrarPagoMercadoPago("555", { mpUserId: "111" })).toBe("ya_registrado");
    expect(escrituras.txUpdates).toHaveLength(1);
    expect(m.enviarEmails).toHaveBeenCalledTimes(1);
    // El pago se registra con upsert sobre (proveedor, ref_externa): nunca dos filas.
    expect(escrituras.upserts.map((u) => (u as { where: unknown }).where)).toEqual([
      { proveedor_refExterna: { proveedor: "mercadopago", refExterna: "555" } },
      { proveedor_refExterna: { proveedor: "mercadopago", refExterna: "555" } },
    ]);
  });
});
