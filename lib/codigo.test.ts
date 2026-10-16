import { describe, expect, it } from "vitest";
import { ALFABETO_CODIGO, candidatosCodigo, generarCodigoReserva, normalizarCodigo } from "./codigo";

describe("generarCodigoReserva", () => {
  it("usa el prefijo de la propiedad y 8 caracteres del alfabeto (≈ 39,6 bits)", () => {
    const codigo = generarCodigoReserva("LL");
    expect(codigo).toMatch(new RegExp(`^LL-[${ALFABETO_CODIGO}]{8}$`));
    expect(8 * Math.log2(ALFABETO_CODIGO.length)).toBeGreaterThan(39.5);
  });

  it("no usa caracteres que se confunden", () => {
    expect(ALFABETO_CODIGO).not.toMatch(/[01OIL]/);
  });

  it("depende solo del azar que recibe", () => {
    expect(generarCodigoReserva("LL", () => 0)).toBe("LL-22222222");
    expect(generarCodigoReserva("LL", (max) => max - 1)).toBe("LL-ZZZZZZZZ");
  });

  it("casi nunca repite en muchas generaciones", () => {
    const codigos = new Set(Array.from({ length: 10_000 }, () => generarCodigoReserva("LL")));
    expect(codigos.size).toBeGreaterThan(9_990);
  });
});

describe("normalizarCodigo", () => {
  it("acepta lo que escribe el huésped con espacios, minúsculas o sin guion", () => {
    expect(normalizarCodigo(" ll-7k3qx9 ")).toBe("LL-7K3QX9");
    expect(normalizarCodigo("ll 7k3qx9")).toBe("LL-7K3QX9");
    expect(normalizarCodigo("LL7K3QX9")).toBe("LL-7K3QX9");
    expect(normalizarCodigo("llka3qx9")).toBe("LL-KA3QX9"); // sufijo que parte con letra
  });

  it("también sirve para los códigos antiguos", () => {
    expect(normalizarCodigo("ll0005")).toBe("LL-0005");
  });

  it("códigos nuevos de 8 caracteres", () => {
    expect(normalizarCodigo("ll 7k3qx9ab")).toBe("LL-7K3QX9AB");
    expect(normalizarCodigo("LL-7K3QX9AB")).toBe("LL-7K3QX9AB");
  });
});

describe("candidatosCodigo", () => {
  it("sin guion prueba el largo nuevo y el anterior", () => {
    expect(candidatosCodigo("ll7k3qx9ab")).toEqual(["LL-7K3QX9AB", "LL7K-3QX9AB"]);
    // Código anterior con prefijo de 3 letras: el segundo candidato es el correcto.
    expect(candidatosCodigo("abc7k3qx9")).toEqual(["A-BC7K3QX9", "ABC-7K3QX9"]);
  });
  it("con guion o en formato antiguo hay una sola forma", () => {
    expect(candidatosCodigo(" ll-7k3qx9 ")).toEqual(["LL-7K3QX9"]);
    expect(candidatosCodigo("ll0005")).toEqual(["LL-0005"]);
  });
});
