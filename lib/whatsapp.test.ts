import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, mensajeReserva } from "./whatsapp";

describe("enlaceWhatsapp", () => {
  it("arma el link wa.me con solo dígitos y el texto codificado", () => {
    expect(enlaceWhatsapp("+56 9 1234 5678", "Hola, ¿qué tal?")).toBe(
      "https://wa.me/56912345678?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F",
    );
  });

  it("devuelve null si el número no sirve", () => {
    expect(enlaceWhatsapp("", "Hola")).toBeNull();
    expect(enlaceWhatsapp("123", "Hola")).toBeNull();
  });
});

describe("mensajeReserva", () => {
  it("incluye código, cabaña y fechas en español", () => {
    expect(
      mensajeReserva({
        codigo: "LL-0001",
        cabana: "Cabaña Volcán Osorno",
        checkIn: "2027-01-10",
        checkOut: "2027-01-13",
        nombre: "Ana",
      }),
    ).toBe("Hola, soy Ana. Hice la reserva LL-0001 en Cabaña Volcán Osorno, del 10 de enero de 2027 al 13 de enero de 2027.");
  });
});
