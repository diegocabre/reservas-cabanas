import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEMA_MAICOLPUE } from "@/prisma/temas";
import { COLORES_TEMA, contraste, estiloTema, leerTema, problemasDeContraste, TEMA_BASE } from "@/lib/tema";

describe("contraste", () => {
  it("calcula la razón WCAG", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contraste("#ffffff", "#ffffff")).toBe(1);
    expect(contraste("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe("TEMA_BASE", () => {
  it("coincide con las variables de :root en app/globals.css", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const raiz = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    for (const nombre of COLORES_TEMA) {
      const valor = raiz.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
      expect(valor, `--${nombre}`).toBe(TEMA_BASE[nombre]);
    }
  });

  it("tiene contraste suficiente", () => {
    expect(problemasDeContraste(null)).toEqual([]);
  });
});

describe("TEMA_MAICOLPUE", () => {
  it("es un tema válido y se lee igual desde la base", () => {
    expect(leerTema(JSON.parse(JSON.stringify(TEMA_MAICOLPUE)))).toEqual(TEMA_MAICOLPUE);
  });

  it("tiene contraste AA en todas las combinaciones de texto", () => {
    expect(problemasDeContraste(TEMA_MAICOLPUE)).toEqual([]);
  });

  it("es distinto de la paleta base: sin el crema ni el terracota", () => {
    expect(TEMA_MAICOLPUE.colores.papel).not.toBe(TEMA_BASE.papel);
    expect(TEMA_MAICOLPUE.colores.fuego).not.toBe(TEMA_BASE.fuego);
  });
});

describe("leerTema", () => {
  it("ignora temas inválidos en vez de romper la página", () => {
    expect(leerTema(null)).toBeNull();
    expect(leerTema({ colores: { papel: "rojo" } })).toBeNull();
    expect(leerTema({ colores: { inventado: "#ffffff" } })).toBeNull();
    expect(leerTema({ colores: {}, extra: true })).toBeNull();
    expect(leerTema("texto")).toBeNull();
  });

  it("completa los valores por defecto", () => {
    expect(leerTema({})).toEqual({ colores: {}, titulos: "serif" });
  });
});

describe("estiloTema", () => {
  it("sobrescribe solo las variables del tema y cambia la fuente de títulos si es sans", () => {
    expect(estiloTema({ colores: { fuego: "#0c6b75" }, titulos: "sans" })).toEqual({
      "--fuego": "#0c6b75",
      "--font-titulo": "var(--font-texto)",
    });
    expect(estiloTema(null)).toEqual({});
  });
});

describe("problemasDeContraste", () => {
  it("detecta un botón ilegible", () => {
    const problemas = problemasDeContraste({ colores: { fuego: "#f0f0f0" }, titulos: "serif" });
    expect(problemas.some((p) => p.startsWith("botón principal:"))).toBe(true);
  });
});
