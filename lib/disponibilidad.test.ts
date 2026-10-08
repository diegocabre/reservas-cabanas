import { describe, expect, it } from "vitest";
import {
  limiteSalida,
  llegadaPosible,
  nochesOcupadas,
  primeraSalida,
  reservaOcupa,
  salidaMuyCorta,
  validarEstadia,
} from "./disponibilidad";
import { RangoInvalidoError } from "./precios";

// Ana: 10 → 13 ene (noches 10, 11, 12). Bloqueo: 20 → 22 ene (noches 20, 21).
const ocupadas = nochesOcupadas([
  { desde: "2027-01-10", hasta: "2027-01-13" },
  { desde: new Date("2027-01-20T00:00:00Z"), hasta: new Date("2027-01-22T00:00:00Z") },
]);

describe("nochesOcupadas", () => {
  it("marca las noches sin incluir el día de salida", () => {
    expect([...ocupadas].sort()).toEqual(["2027-01-10", "2027-01-11", "2027-01-12", "2027-01-20", "2027-01-21"]);
  });
});

describe("validarEstadia", () => {
  it("acepta una estadía en noches libres", () => {
    expect(validarEstadia("2027-01-14", "2027-01-18", ocupadas)).toEqual({ disponible: true });
  });

  it("permite llegar el día que sale otro huésped", () => {
    expect(validarEstadia("2027-01-13", "2027-01-16", ocupadas).disponible).toBe(true);
  });

  it("permite salir el día que llega otro huésped", () => {
    expect(validarEstadia("2027-01-07", "2027-01-10", ocupadas).disponible).toBe(true);
  });

  it("rechaza traslapes e informa la primera noche ocupada", () => {
    expect(validarEstadia("2027-01-08", "2027-01-12", ocupadas)).toEqual({
      disponible: false,
      primeraNocheOcupada: "2027-01-10",
    });
    expect(validarEstadia("2027-01-15", "2027-01-25", ocupadas)).toEqual({
      disponible: false,
      primeraNocheOcupada: "2027-01-20",
    });
  });
});

describe("limiteSalida", () => {
  it("devuelve la primera noche ocupada después de la llegada", () => {
    expect(limiteSalida("2027-01-14", ocupadas)).toBe("2027-01-20");
    expect(limiteSalida("2027-01-05", ocupadas)).toBe("2027-01-10");
  });

  it("devuelve null si no hay nada ocupado más adelante", () => {
    expect(limiteSalida("2027-01-22", ocupadas)).toBeNull();
  });

  it("falla si la noche de llegada está ocupada", () => {
    expect(() => limiteSalida("2027-01-11", ocupadas)).toThrow(RangoInvalidoError);
  });
});

describe("reservaOcupa", () => {
  const ahora = new Date("2027-01-01T12:00:00Z");

  it("las confirmadas siempre ocupan", () => {
    expect(reservaOcupa({ estado: "confirmada", expiraEn: null }, ahora)).toBe(true);
  });

  it("las pendientes ocupan solo mientras no vencen", () => {
    expect(reservaOcupa({ estado: "pendiente_pago", expiraEn: new Date("2027-01-01T12:10:00Z") }, ahora)).toBe(true);
    expect(reservaOcupa({ estado: "pendiente_pago", expiraEn: new Date("2027-01-01T11:59:00Z") }, ahora)).toBe(false);
    expect(reservaOcupa({ estado: "pendiente_pago", expiraEn: null }, ahora)).toBe(true);
  });

  it("canceladas y completadas no ocupan", () => {
    expect(reservaOcupa({ estado: "cancelada", expiraEn: null }, ahora)).toBe(false);
    expect(reservaOcupa({ estado: "completada", expiraEn: null }, ahora)).toBe(false);
  });
});

// Lo que usa el calendario del navegador para la estadía mínima (el servidor la valida en calcularPrecio).
describe("estadía mínima en el calendario", () => {
  it("la primera salida posible es llegada + min_noches", () => {
    expect(primeraSalida("2027-02-27", 2)).toBe("2027-03-01");
    expect(primeraSalida("2027-01-30", 3)).toBe("2027-02-02");
  });

  it("marca como muy corta una salida de 1 noche y acepta 2", () => {
    expect(salidaMuyCorta("2027-01-14", "2027-01-15", 2)).toBe(true); // 1 noche: se avisa "Estadía mínima: 2 noches"
    expect(salidaMuyCorta("2027-01-14", "2027-01-16", 2)).toBe(false); // 2 noches
    expect(salidaMuyCorta("2027-01-14", "2027-01-20", 2)).toBe(false);
    expect(salidaMuyCorta("2027-01-14", "2027-01-14", 2)).toBe(false); // no es una salida: es volver a elegir llegada
  });

  it("solo deja llegar si las noches mínimas están libres", () => {
    const ultimoDia = "2027-12-31";
    expect(llegadaPosible("2027-01-13", 2, ocupadas, ultimoDia)).toBe(true); // noches 13 y 14 libres
    expect(llegadaPosible("2027-01-19", 2, ocupadas, ultimoDia)).toBe(false); // la noche 20 está bloqueada
    expect(llegadaPosible("2027-01-19", 1, ocupadas, ultimoDia)).toBe(true);
    expect(llegadaPosible("2027-01-12", 2, ocupadas, ultimoDia)).toBe(false); // noche ocupada por Ana
  });

  it("no deja llegar si la salida mínima pasa del último día reservable", () => {
    expect(llegadaPosible("2027-12-29", 2, new Set(), "2027-12-31")).toBe(true);
    expect(llegadaPosible("2027-12-30", 2, new Set(), "2027-12-31")).toBe(false);
  });
});
