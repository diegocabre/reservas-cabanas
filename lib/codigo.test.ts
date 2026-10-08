import { describe, expect, it } from "vitest";
import { ALFABETO_CODIGO, generarCodigoReserva, normalizarCodigo } from "./codigo";

describe("generarCodigoReserva", () => {
  it("usa el prefijo de la propiedad y 6 caracteres del alfabeto", () => {
    const codigo = generarCodigoReserva("LL");
    expect(codigo).toMatch(new RegExp(`^LL-[${ALFABETO_CODIGO}]{6}$`));
  });

  it("no usa caracteres que se confunden", () => {
    expect(ALFABETO_CODIGO).not.toMatch(/[01OIL]/);
  });

  it("depende solo del azar que recibe", () => {
    expect(generarCodigoReserva("LL", () => 0)).toBe("LL-222222");
    expect(generarCodigoReserva("LL", (max) => max - 1)).toBe("LL-ZZZZZZ");
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
});
