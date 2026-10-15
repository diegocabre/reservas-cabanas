import { describe, expect, it } from "vitest";
import { mensajeLogin, requiereSesion, urlLogin } from "@/lib/acceso";

describe("requiereSesion", () => {
  it("protege todo el panel", () => {
    expect(requiereSesion("/admin")).toBe(true);
    expect(requiereSesion("/admin/reservas")).toBe(true);
    expect(requiereSesion("/admin/reservas/LL-7K3QX9")).toBe(true);
  });

  it("deja libres el login, el callback y la salida", () => {
    expect(requiereSesion("/admin/login")).toBe(false);
    expect(requiereSesion("/admin/confirmar")).toBe(false);
    expect(requiereSesion("/admin/salir")).toBe(false);
  });

  it("no confunde rutas parecidas ni toca las páginas públicas", () => {
    expect(requiereSesion("/administrar")).toBe(false);
    expect(requiereSesion("/admin/loginx")).toBe(true);
    expect(requiereSesion("/maicolpue/maicolpue")).toBe(false);
    expect(requiereSesion("/reserva/LL-7K3QX9")).toBe(false);
  });
});

describe("mensajes del login", () => {
  it("traduce los motivos conocidos e ignora el resto", () => {
    expect(mensajeLogin("link")).toMatch(/link/);
    expect(mensajeLogin("sin-acceso")).toMatch(/^Sin acceso/);
    expect(mensajeLogin("suspendida")).toMatch(/suspendida/);
    expect(mensajeLogin("cualquiera")).toBeNull();
    expect(mensajeLogin("toString")).toBeNull();
    expect(mensajeLogin(undefined)).toBeNull();
  });

  it("arma la URL del login con su motivo", () => {
    expect(urlLogin()).toBe("/admin/login");
    expect(urlLogin("sin-acceso")).toBe("/admin/login?error=sin-acceso");
  });
});
