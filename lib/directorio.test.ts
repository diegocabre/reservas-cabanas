import { describe, expect, it } from "vitest";
import { destinoPropiedad, propiedadesVisibles, type PropiedadDirectorio } from "@/lib/directorio";

const p = (slug: string, nombre: string, cabanas: { slug: string; demo: boolean }[], bloqueo: string | null = null): PropiedadDirectorio => ({
  slug,
  nombre,
  cabanas,
  bloqueo,
});

describe("destinoPropiedad", () => {
  it("con una sola cabaña va directo a ella", () => {
    expect(destinoPropiedad(p("maicolpue", "Cabaña Maicolpue", [{ slug: "maicolpue", demo: false }]))).toBe("/maicolpue/maicolpue");
  });

  it("con varias cabañas va a la página de la propiedad", () => {
    const llanquihue = p("lago-llanquihue", "Cabañas Lago Llanquihue", [
      { slug: "volcan-osorno", demo: true },
      { slug: "los-arrayanes", demo: true },
    ]);
    expect(destinoPropiedad(llanquihue)).toBe("/lago-llanquihue");
  });
});

describe("propiedadesVisibles", () => {
  it("muestra las reales primero, ordenadas por nombre, y las demo al final", () => {
    const lista = [
      p("demo", "Cabañas Lago Llanquihue", [{ slug: "a", demo: true }]),
      p("ensenada", "Refugio Ensenada", [{ slug: "b", demo: false }]),
      p("maicolpue", "Cabaña Maicolpue", [{ slug: "c", demo: false }]),
    ];
    expect(propiedadesVisibles(lista).map((x) => x.slug)).toEqual(["maicolpue", "ensenada", "demo"]);
  });

  it("oculta las propiedades sin cabañas listadas o que no pueden publicarse", () => {
    const lista = [
      p("vacia", "Sin cabañas", []),
      p("pendiente", "Con datos pendientes", [{ slug: "a", demo: false }], "Esta cabaña todavía no recibe reservas"),
      p("lista", "Lista", [{ slug: "b", demo: false }]),
    ];
    expect(propiedadesVisibles(lista).map((x) => x.slug)).toEqual(["lista"]);
  });

  it("una propiedad con alguna cabaña real no cuenta como demo", () => {
    const lista = [p("mixta", "B mixta", [{ slug: "a", demo: true }, { slug: "b", demo: false }]), p("real", "C real", [{ slug: "c", demo: false }])];
    expect(propiedadesVisibles(lista).map((x) => x.slug)).toEqual(["mixta", "real"]);
  });
});
