// Los dos cron exigen "Authorization: Bearer <CRON_SECRET>" (lo envía Vercel Cron) y rechazan todo lo demás.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ procesarSolicitudes: vi.fn(), procesarResenas: vi.fn(), limpiarIntentos: vi.fn() }));
vi.mock("@/lib/aprobacion", () => ({ procesarSolicitudes: m.procesarSolicitudes }));
vi.mock("@/lib/resenas", () => ({ procesarResenas: m.procesarResenas }));
vi.mock("@/lib/limites", () => ({ limpiarIntentos: m.limpiarIntentos }));

import { GET as expirar } from "./expirar-reservas/route";
import { GET as resenas } from "./resenas/route";

const pedir = (auth?: string) => new Request("https://reservas.example.cl/api/cron/x", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  m.procesarSolicitudes.mockResolvedValue({ expiradas: 0 });
  m.procesarResenas.mockResolvedValue({ invitaciones: 0 });
  m.limpiarIntentos.mockResolvedValue(0);
});

describe.each([
  ["expirar-reservas", expirar, m.procesarSolicitudes],
  ["resenas", resenas, m.procesarResenas],
])("cron %s", (_nombre, GET, trabajo) => {
  it("sin CRON_SECRET configurado rechaza siempre (incluso 'Bearer undefined')", async () => {
    expect((await GET(pedir())).status).toBe(401);
    expect((await GET(pedir("Bearer undefined"))).status).toBe(401);
    expect((await GET(pedir("Bearer "))).status).toBe(401);
    expect(trabajo).not.toHaveBeenCalled();
  });

  it("sin cabecera, con otro secreto o con otro esquema: 401", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-cron");
    for (const auth of [undefined, "Bearer otro", "secreto-cron", "Basic secreto-cron", "bearer secreto-cron"]) {
      expect((await GET(pedir(auth))).status).toBe(401);
    }
    expect(trabajo).not.toHaveBeenCalled();
  });

  it("con el secreto correcto corre", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-cron");
    expect((await GET(pedir("Bearer secreto-cron"))).status).toBe(200);
    expect(trabajo).toHaveBeenCalledTimes(1);
  });
});
