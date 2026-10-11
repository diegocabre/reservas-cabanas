import { describe, expect, it } from "vitest";
import { hayFiltros, leerFiltros, terminosBusqueda } from "@/lib/filtros-reservas";

const HOY = "2026-10-11";
const CABANA = "3f0c2a4e-8d1b-4c6a-9e2f-1a2b3c4d5e6f";

describe("leerFiltros", () => {
  it("sin parámetros muestra todas desde hoy", () => {
    expect(leerFiltros({}, HOY)).toEqual({ estado: "todas", cabana: null, desde: HOY, hasta: null, q: "" });
  });

  it("con desde vacío incluye las pasadas", () => {
    expect(leerFiltros({ desde: "" }, HOY).desde).toBeNull();
  });

  it("lee estado, cabaña, rango y búsqueda válidos", () => {
    expect(
      leerFiltros({ estado: "revisar", cabana: CABANA, desde: "2026-11-01", hasta: "2026-11-30", q: "  Javiera " }, HOY),
    ).toEqual({ estado: "revisar", cabana: CABANA, desde: "2026-11-01", hasta: "2026-11-30", q: "Javiera" });
  });

  it("descarta valores inválidos de la URL", () => {
    expect(leerFiltros({ estado: "borrada", cabana: "'; drop table", desde: "ayer", hasta: "31-12-2026" }, HOY)).toEqual({
      estado: "todas",
      cabana: null,
      desde: null,
      hasta: null,
      q: "",
    });
  });

  it("da vuelta un rango invertido", () => {
    const f = leerFiltros({ desde: "2026-12-10", hasta: "2026-12-01" }, HOY);
    expect([f.desde, f.hasta]).toEqual(["2026-12-01", "2026-12-10"]);
  });

  it("toma el primer valor si el parámetro viene repetido y corta búsquedas largas", () => {
    expect(leerFiltros({ estado: ["confirmada", "cancelada"], q: "x".repeat(200) }, HOY)).toMatchObject({
      estado: "confirmada",
      q: "x".repeat(80),
    });
  });
});

describe("terminosBusqueda", () => {
  it("busca el texto tal cual y también normalizado como código", () => {
    expect(terminosBusqueda("ma 7k3qx9")).toEqual({ texto: "ma 7k3qx9", codigo: "MA-7K3QX9" });
    expect(terminosBusqueda("")).toBeNull();
  });
});

describe("hayFiltros", () => {
  it("es falso solo con los filtros iniciales", () => {
    expect(hayFiltros(leerFiltros({}, HOY), HOY)).toBe(false);
    expect(hayFiltros(leerFiltros({ desde: "" }, HOY), HOY)).toBe(true);
    expect(hayFiltros(leerFiltros({ q: "ana" }, HOY), HOY)).toBe(true);
  });
});
