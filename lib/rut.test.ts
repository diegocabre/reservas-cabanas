import { describe, expect, it } from "vitest";
import { calcularDv, normalizarRut, validarRut } from "./rut";

describe("validarRut", () => {
  it("acepta RUT válidos con o sin puntos y guion", () => {
    expect(validarRut("11.111.111-1")).toBe(true);
    expect(validarRut("12.345.678-5")).toBe(true);
    expect(validarRut("123456785")).toBe(true);
    expect(validarRut("7.654.321-6")).toBe(true); // cuerpo de 7 dígitos
  });

  it("acepta la K como dígito verificador, en mayúscula o minúscula", () => {
    expect(calcularDv("10000013")).toBe("K");
    expect(validarRut("10.000.013-k")).toBe(true);
    expect(validarRut("10000013K")).toBe(true);
  });

  it("rechaza dígito verificador incorrecto", () => {
    expect(validarRut("12.345.678-9")).toBe(false);
    expect(validarRut("11.111.111-K")).toBe(false);
  });

  it("rechaza formatos inválidos", () => {
    expect(validarRut("")).toBe(false);
    expect(validarRut("123")).toBe(false);
    expect(validarRut("abc.def.ghi-j")).toBe(false);
    expect(validarRut("123.456.789.0-1")).toBe(false);
  });
});

describe("normalizarRut", () => {
  it("deja el RUT como cuerpo-DV sin puntos y con K mayúscula", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut("10.000.013-k")).toBe("10000013-K");
  });
});
