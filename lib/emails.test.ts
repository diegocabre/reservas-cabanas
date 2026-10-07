import { describe, expect, it, vi } from "vitest";

// lib/emails importa la base de datos; para estas funciones puras no la necesitamos.
vi.mock("@/lib/db", () => ({ db: {} }));

const { asuntoConfirmacion, esEmailEnviable } = await import("./emails");

describe("esEmailEnviable", () => {
  it("acepta emails reales", () => {
    expect(esEmailEnviable("ana@gmail.com")).toBe(true);
    expect(esEmailEnviable("contacto@solucionesdys.cl")).toBe(true);
  });

  it("descarta vacíos, mal formados y los de ejemplo del seed", () => {
    expect(esEmailEnviable("")).toBe(false);
    expect(esEmailEnviable(null)).toBe(false);
    expect(esEmailEnviable("ana@")).toBe(false);
    expect(esEmailEnviable("contacto@example.com")).toBe(false);
    expect(esEmailEnviable("prueba@EXAMPLE.COM")).toBe(false);
  });
});

describe("asuntoConfirmacion", () => {
  it("incluye código y cabaña, y marca las pruebas", () => {
    expect(asuntoConfirmacion({ codigo: "LL-0007", cabana: "Cabaña Los Arrayanes", prueba: false })).toBe(
      "Reserva LL-0007 confirmada · Cabaña Los Arrayanes",
    );
    expect(asuntoConfirmacion({ codigo: "LL-0007", cabana: "Cabaña Los Arrayanes", prueba: true })).toBe(
      "[Prueba] Reserva LL-0007 confirmada · Cabaña Los Arrayanes",
    );
  });
});
