import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  crearReservaWeb: vi.fn(),
  enviarEmailReservaApartada: vi.fn(),
  avisarSolicitudNueva: vi.fn(),
  consumirIntento: vi.fn(),
  cupoCorreo: vi.fn(),
  tareas: [] as Promise<unknown>[],
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vercel-forwarded-for": "200.1.1.1" }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => m.tareas.push(fn()) }));
vi.mock("@/lib/reservas", () => ({ crearReservaWeb: m.crearReservaWeb }));
vi.mock("@/lib/emails", () => ({ enviarEmailReservaApartada: m.enviarEmailReservaApartada }));
vi.mock("@/lib/aprobacion", () => ({ avisarSolicitudNueva: m.avisarSolicitudNueva }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/limites", async (original) => ({
  ...(await original<typeof import("@/lib/limites")>()),
  consumirIntento: m.consumirIntento,
  cupoCorreo: m.cupoCorreo,
}));

import { CAMPO_MARCA, CAMPO_SENUELO, firmarMarca } from "@/lib/anti-bot";
import { MENSAJE_LIMITE } from "@/lib/limites";
import { crearReserva } from "./acciones";

function formulario(extra: Record<string, string> = {}) {
  const f = new FormData();
  const campos = {
    propiedad: "maicolpue",
    cabana: "cabana-1",
    checkIn: "2026-11-10",
    checkOut: "2026-11-13",
    adultos: "2",
    ninos: "0",
    nombre: "Ana Pérez",
    email: "ana@correo.cl",
    telefono: "9 1234 5678",
    rut: "11.111.111-1",
    notas: "",
    [CAMPO_SENUELO]: "",
    // Formulario mostrado hace un minuto.
    [CAMPO_MARCA]: firmarMarca(new Date(Date.now() - 60_000)),
    ...extra,
  };
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function enviar(f: FormData) {
  try {
    return { estado: await crearReserva({}, f) };
  } catch (e) {
    return { redirigeA: (e as { url?: string }).url };
  } finally {
    await Promise.all(m.tareas);
    m.tareas.length = 0;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LIMITES_SECRETO", "secreto-de-prueba");
  m.consumirIntento.mockResolvedValue(true);
  m.cupoCorreo.mockResolvedValue(true);
  m.crearReservaWeb.mockResolvedValue({ ok: true, codigo: "LL-7K3QX9", estado: "pendiente_pago" });
});

describe("crearReserva", () => {
  it("huésped legítimo: crea la reserva, envía el correo con el link y va a la confirmación", async () => {
    expect(await enviar(formulario())).toEqual({ redirigeA: "/reserva/LL-7K3QX9" });
    expect(m.crearReservaWeb).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@correo.cl", telefono: "+56912345678" }));
    expect(m.enviarEmailReservaApartada).toHaveBeenCalledWith("LL-7K3QX9");
    expect(m.avisarSolicitudNueva).not.toHaveBeenCalled();
  });

  it("cabaña con aprobación manual: avisa la solicitud igual que antes", async () => {
    m.crearReservaWeb.mockResolvedValue({ ok: true, codigo: "LL-7K3QX9", estado: "pendiente_aprobacion" });
    expect(await enviar(formulario())).toEqual({ redirigeA: "/reserva/LL-7K3QX9" });
    expect(m.avisarSolicitudNueva).toHaveBeenCalledWith("LL-7K3QX9", { huesped: true });
    expect(m.enviarEmailReservaApartada).not.toHaveBeenCalled();
  });

  it("sobre el tope de correos: la reserva se crea, pero no se envía el correo al huésped", async () => {
    m.cupoCorreo.mockResolvedValue(false);
    expect(await enviar(formulario())).toEqual({ redirigeA: "/reserva/LL-7K3QX9" });
    expect(m.enviarEmailReservaApartada).not.toHaveBeenCalled();

    m.crearReservaWeb.mockResolvedValue({ ok: true, codigo: "LL-7K3QX9", estado: "pendiente_aprobacion" });
    await enviar(formulario());
    // El dueño igual recibe el aviso de la solicitud.
    expect(m.avisarSolicitudNueva).toHaveBeenCalledWith("LL-7K3QX9", { huesped: false });
  });

  it("señuelo lleno: rechazado sin crear nada", async () => {
    const r = await enviar(formulario({ [CAMPO_SENUELO]: "spam" }));
    expect(r.estado?.error).toMatch(/Recarga la página/);
    expect(m.crearReservaWeb).not.toHaveBeenCalled();
    expect(m.consumirIntento).not.toHaveBeenCalled();
  });

  it("envío instantáneo: rechazado", async () => {
    const r = await enviar(formulario({ [CAMPO_MARCA]: firmarMarca(new Date()) }));
    expect(r.estado?.error).toMatch(/Recarga la página/);
    expect(m.crearReservaWeb).not.toHaveBeenCalled();
  });

  it("límite por IP superado: mensaje amable y conserva lo escrito", async () => {
    m.consumirIntento.mockResolvedValue(false);
    const r = await enviar(formulario());
    expect(r.estado?.error).toBe(MENSAJE_LIMITE);
    expect(r.estado?.valores?.nombre).toBe("Ana Pérez");
    expect(m.crearReservaWeb).not.toHaveBeenCalled();
  });

  it("un error de validación no gasta intentos", async () => {
    const r = await enviar(formulario({ email: "no-es-email" }));
    expect(r.estado?.errores?.email).toBeDefined();
    expect(m.consumirIntento).not.toHaveBeenCalled();
  });

  it("la IP se guarda como hash, nunca en claro", async () => {
    await enviar(formulario());
    const [accion, clave] = m.consumirIntento.mock.calls[0];
    expect(accion).toBe("reservar");
    expect(clave).not.toContain("200.1.1.1");
  });
});
