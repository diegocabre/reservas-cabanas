import { describe, expect, it } from "vitest";
import { esquemaReserva, normalizarTelefono } from "./reserva-esquema";

const valido = {
  propiedad: "lago-llanquihue",
  cabana: "volcan-osorno",
  checkIn: "2027-01-10",
  checkOut: "2027-01-13",
  adultos: "2",
  ninos: "1",
  nombre: "  Ana Pérez ",
  email: " Ana@Example.com ",
  telefono: "9 1234 5678",
  rut: "12.345.678-5",
  notas: "",
};

describe("normalizarTelefono", () => {
  it("normaliza celulares chilenos escritos de distintas formas", () => {
    expect(normalizarTelefono("9 1234 5678")).toBe("+56912345678");
    expect(normalizarTelefono("+56 9 1234 5678")).toBe("+56912345678");
    expect(normalizarTelefono("56912345678")).toBe("+56912345678");
  });

  it("acepta números extranjeros con +", () => {
    expect(normalizarTelefono("+54 11 2345 6789")).toBe("+541123456789");
  });

  it("rechaza lo que no parece teléfono", () => {
    expect(normalizarTelefono("1234")).toBeNull();
    expect(normalizarTelefono("22 345 6789")).toBeNull(); // fijo sin +56: pedimos celular
    expect(normalizarTelefono("hola")).toBeNull();
  });
});

describe("esquemaReserva", () => {
  it("acepta datos válidos y los normaliza", () => {
    const r = esquemaReserva.parse(valido);
    expect(r).toMatchObject({
      adultos: 2,
      ninos: 1,
      nombre: "Ana Pérez",
      email: "ana@example.com",
      telefono: "+56912345678",
      rut: "12345678-5",
    });
  });

  it("exige el RUT y valida su dígito verificador", () => {
    const sinRut = esquemaReserva.safeParse({ ...valido, rut: "" });
    expect(sinRut.success).toBe(false);
    expect(sinRut.error?.issues[0]).toMatchObject({ path: ["rut"], message: "El RUT es obligatorio" });

    const malo = esquemaReserva.safeParse({ ...valido, rut: "12.345.678-9" });
    expect(malo.error?.issues[0]).toMatchObject({ path: ["rut"], message: "Revisa el RUT y su dígito verificador" });
  });

  it("rechaza email, teléfono y adultos inválidos", () => {
    const r = esquemaReserva.safeParse({ ...valido, email: "ana@", telefono: "123", adultos: "0" });
    const campos = r.error?.issues.map((i) => i.path[0]).sort();
    expect(campos).toEqual(["adultos", "email", "telefono"]);
  });

  it("exige que la salida sea posterior a la llegada", () => {
    const r = esquemaReserva.safeParse({ ...valido, checkOut: "2027-01-10" });
    expect(r.error?.issues[0]).toMatchObject({ path: ["checkOut"] });
  });
});
