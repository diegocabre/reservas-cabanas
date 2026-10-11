import { describe, expect, it } from "vitest";
import { mensajeIngreso, requiereSesion } from "@/lib/acceso";

describe("requiereSesion", () => {
  it("protege el panel y sus subpáginas", () => {
    expect(requiereSesion("/admin")).toBe(true);
    expect(requiereSesion("/admin/reservas")).toBe(true);
    expect(requiereSesion("/admin/reservas/LL-7K3QX9")).toBe(true);
  });

  it("deja libres las páginas para ingresar", () => {
    expect(requiereSesion("/admin/ingresar")).toBe(false);
    expect(requiereSesion("/admin/confirmar")).toBe(false);
  });

  it("no confunde rutas parecidas ni toca las páginas públicas", () => {
    expect(requiereSesion("/administrar")).toBe(false);
    expect(requiereSesion("/admin/ingresarx")).toBe(true);
    expect(requiereSesion("/maicolpue/maicolpue")).toBe(false);
    expect(requiereSesion("/reserva/LL-7K3QX9")).toBe(false);
  });
});

describe("mensajeIngreso", () => {
  it("traduce los motivos conocidos e ignora el resto", () => {
    expect(mensajeIngreso("link")).toMatch(/link/);
    expect(mensajeIngreso("sin-acceso")).toMatch(/no tiene acceso/);
    expect(mensajeIngreso("cualquiera")).toBeNull();
    expect(mensajeIngreso("toString")).toBeNull();
    expect(mensajeIngreso(undefined)).toBeNull();
  });
});
