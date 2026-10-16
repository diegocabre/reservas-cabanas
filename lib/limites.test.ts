import { beforeEach, describe, expect, it, vi } from "vitest";

// Base simulada en memoria: guarda los intentos y respeta la ventana de tiempo de las consultas.
const m = vi.hoisted(() => {
  const filas: { accion: string; clave: string; creadoEn: Date }[] = [];
  let reloj = new Date("2026-10-16T12:00:00Z");
  const db = {
    intentoPublico: {
      count: async ({ where }: { where: { accion: string; clave: string; creadoEn: { gt: Date } } }) =>
        filas.filter((f) => f.accion === where.accion && f.clave === where.clave && f.creadoEn > where.creadoEn.gt).length,
      create: async ({ data }: { data: { accion: string; clave: string } }) => filas.push({ ...data, creadoEn: reloj }),
      deleteMany: async ({ where }: { where: { creadoEn: { lt: Date } } }) => {
        const antes = filas.length;
        filas.splice(0, filas.length, ...filas.filter((f) => !(f.creadoEn < where.creadoEn.lt)));
        return { count: antes - filas.length };
      },
    },
  };
  return { filas, db, ponerReloj: (d: Date) => (reloj = d) };
});
vi.mock("@/lib/db", () => ({ db: m.db }));

import { claveHash, consumirIntento, cupoCorreo, ipDeLaSolicitud, limites, limpiarIntentos, secretoLimites } from "./limites";

const T0 = new Date("2026-10-16T12:00:00Z");
const masMinutos = (min: number) => new Date(T0.getTime() + min * 60_000);

beforeEach(() => {
  m.filas.length = 0;
  m.ponerReloj(T0);
  vi.unstubAllEnvs();
  vi.stubEnv("LIMITES_SECRETO", "secreto-de-prueba");
});

describe("limites", () => {
  it("valores por defecto", () => {
    expect(limites({})).toEqual({
      pendientesPorContacto: 2,
      reservasPorIpHora: 10,
      correosPorDestinoDia: 3,
      maxNoches: 30,
      consultasPorIpHora: 30,
      busquedasPorCodigoHora: 10,
      noEncontradasPorIpHora: 20,
      linksPorIpHora: 10,
    });
  });

  it("se ajustan por variable de entorno; valores inválidos usan el por defecto", () => {
    const l = limites({ LIMITE_RESERVAS_IP_HORA: "25", RESERVAS_MAX_NOCHES: "abc", LIMITE_PENDIENTES_POR_CONTACTO: "0" });
    expect(l.reservasPorIpHora).toBe(25);
    expect(l.maxNoches).toBe(30);
    expect(l.pendientesPorContacto).toBe(2);
  });
});

describe("ipDeLaSolicitud", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("prefiere el encabezado de Vercel", () => {
    expect(ipDeLaSolicitud(h({ "x-vercel-forwarded-for": "200.1.1.1", "x-forwarded-for": "10.0.0.1" }))).toBe("200.1.1.1");
  });
  it("si no, el primer valor de x-forwarded-for", () => {
    expect(ipDeLaSolicitud(h({ "x-forwarded-for": "190.2.2.2, 10.0.0.1" }))).toBe("190.2.2.2");
  });
  it("sin encabezados (local): 'desconocida'", () => {
    expect(ipDeLaSolicitud(h({}))).toBe("desconocida");
  });
});

describe("claveHash", () => {
  it("no guarda el valor en claro y normaliza mayúsculas y espacios", () => {
    const a = claveHash("email", " Ana@Correo.cl ", "s");
    expect(a).not.toContain("ana");
    expect(a).toBe(claveHash("email", "ana@correo.cl", "s"));
  });
  it("depende de la sal y del tipo", () => {
    expect(claveHash("ip", "1.2.3.4", "s1")).not.toBe(claveHash("ip", "1.2.3.4", "s2"));
    expect(claveHash("ip", "x", "s")).not.toBe(claveHash("email", "x", "s"));
  });
  it("sin LIMITES_SECRETO usa un secreto derivado estable (no rompe producción)", () => {
    const env = { MERCADOPAGO_CLAVE_CIFRADO: "clave" };
    expect(secretoLimites(env)).toBe(secretoLimites(env));
    expect(secretoLimites(env)).not.toBe("clave");
  });
});

describe("consumirIntento", () => {
  it("permite hasta el máximo y después bloquea", async () => {
    for (let i = 0; i < 3; i++) expect(await consumirIntento("reservar", "k", 3, 60, T0)).toBe(true);
    expect(await consumirIntento("reservar", "k", 3, 60, T0)).toBe(false);
    // Un rechazo no se anota: no alarga el bloqueo.
    expect(m.filas).toHaveLength(3);
  });

  it("los contadores expiran con la ventana", async () => {
    for (let i = 0; i < 3; i++) await consumirIntento("reservar", "k", 3, 60, T0);
    expect(await consumirIntento("reservar", "k", 3, 60, masMinutos(59))).toBe(false);
    expect(await consumirIntento("reservar", "k", 3, 60, masMinutos(61))).toBe(true);
  });

  it("cada clave y cada acción tienen su propio contador", async () => {
    for (let i = 0; i < 3; i++) await consumirIntento("reservar", "k1", 3, 60, T0);
    expect(await consumirIntento("reservar", "k2", 3, 60, T0)).toBe(true);
    expect(await consumirIntento("resena", "k1", 3, 60, T0)).toBe(true);
  });
});

describe("cupoCorreo", () => {
  it("tope diario por dirección: el cuarto correo del día no sale y al día siguiente vuelve el cupo", async () => {
    const enviados = [];
    for (let i = 0; i < 4; i++) enviados.push(await cupoCorreo("ana@correo.cl", T0));
    expect(enviados).toEqual([true, true, true, false]);
    expect(await cupoCorreo("otra@correo.cl", T0)).toBe(true);
    expect(await cupoCorreo("ana@correo.cl", masMinutos(24 * 60 + 1))).toBe(true);
    // En la base solo hay hashes.
    expect(m.filas.some((f) => f.clave.includes("ana"))).toBe(false);
  });
});

describe("limpiarIntentos", () => {
  it("borra los de más de 48 horas y es idempotente", async () => {
    m.ponerReloj(new Date(T0.getTime() - 49 * 3_600_000));
    await consumirIntento("reservar", "vieja", 10, 60);
    m.ponerReloj(T0);
    await consumirIntento("reservar", "nueva", 10, 60);
    expect(await limpiarIntentos(T0)).toBe(1);
    expect(await limpiarIntentos(T0)).toBe(0);
    expect(m.filas.map((f) => f.clave)).toEqual(["nueva"]);
  });
});

describe("si la base falla", () => {
  it("deja pasar (nunca bloquea a un huésped por un error nuestro)", async () => {
    const original = m.db.intentoPublico.count;
    m.db.intentoPublico.count = async () => {
      throw new Error('relation "intentos_publicos" does not exist');
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await consumirIntento("reservar", "k", 1, 60, T0)).toBe(true);
      expect(await consumirIntento("reservar", "k", 1, 60, T0)).toBe(true);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("limites_error"));
    } finally {
      m.db.intentoPublico.count = original;
      error.mockRestore();
    }
  });
});
