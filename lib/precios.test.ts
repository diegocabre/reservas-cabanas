import { describe, expect, it } from "vitest";
import {
  calcularAbono,
  calcularPrecio,
  MinimoNochesError,
  nochesEntre,
  PersonasInvalidasError,
  precioDesde,
  RangoInvalidoError,
  saldoReserva,
  SinTarifaError,
  TarifasTraslapadasError,
  type TarifaPrecio,
} from "./precios";

// Mismas tarifas que el seed para la Cabaña Maicolpue (por noche, fijas todo el año).
const tarifas: TarifaPrecio[] = [
  { personasDesde: 1, personasHasta: 2, nochesDesde: 1, precioNoche: 65_000 },
  { personasDesde: 1, personasHasta: 2, nochesDesde: 3, precioNoche: 50_000 },
  { personasDesde: 3, personasHasta: 5, nochesDesde: 1, precioNoche: 75_000 },
  { personasDesde: 3, personasHasta: 5, nochesDesde: 3, precioNoche: 60_000 },
  { personasDesde: 6, personasHasta: 8, nochesDesde: 1, precioNoche: 85_000 },
  { personasDesde: 6, personasHasta: 8, nochesDesde: 3, precioNoche: 70_000 },
];
const cabana = { nombre: "Cabaña Maicolpue", minNoches: 2, capacidad: 8 };

// 2 noches: 10 → 12 ene. 3 noches: 10 → 13 ene.
const DOS = ["2027-01-10", "2027-01-12"] as const;
const TRES = ["2027-01-10", "2027-01-13"] as const;

const cotizar = (personas: number, [checkIn, checkOut]: readonly [string, string], ts = tarifas, c = cabana) =>
  calcularPrecio({ cabana: c, tarifas: ts, checkIn, checkOut, personas });

describe("nochesEntre", () => {
  it("cuenta las noches sin incluir el día de check-out", () => {
    expect(nochesEntre("2027-01-10", "2027-01-13")).toEqual(["2027-01-10", "2027-01-11", "2027-01-12"]);
  });

  it("cruza cambios de mes y de año", () => {
    expect(nochesEntre("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(nochesEntre("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29"]); // bisiesto
  });

  it("falla si check-out no es posterior a check-in", () => {
    expect(() => nochesEntre("2027-01-10", "2027-01-10")).toThrow(RangoInvalidoError);
    expect(() => nochesEntre("2027-01-10", "2027-01-09")).toThrow(RangoInvalidoError);
  });

  it("rechaza fechas inválidas o con hora", () => {
    expect(() => nochesEntre("2027-02-30", "2027-03-02")).toThrow(RangoInvalidoError);
    expect(() => nochesEntre("10-01-2027", "13-01-2027")).toThrow(RangoInvalidoError);
    expect(() => nochesEntre(new Date("2027-01-10T15:00:00Z"), "2027-01-13")).toThrow(RangoInvalidoError);
  });
});

describe("calcularPrecio", () => {
  it("ejemplo del dueño: 4 personas, 3 noches = 3 × $60.000 = $180.000", () => {
    const c = cotizar(4, TRES);
    expect(c).toMatchObject({ noches: 3, personas: 4, precioNoche: 60_000, total: 180_000 });
  });

  it("con 2 noches cobra la tarifa de 1–2 noches y desde 3 la menor, en TODAS las noches", () => {
    expect(cotizar(4, DOS)).toMatchObject({ precioNoche: 75_000, total: 150_000 });
    expect(cotizar(4, TRES)).toMatchObject({ precioNoche: 60_000, total: 180_000 });
    expect(cotizar(4, ["2027-01-10", "2027-01-17"])).toMatchObject({ noches: 7, precioNoche: 60_000, total: 420_000 });
  });

  it.each([
    // personas, precio 2 noches, precio 3+ noches
    [1, 65_000, 50_000], // 1 persona cae en el tramo de 1 a 2
    [2, 65_000, 50_000],
    [3, 75_000, 60_000],
    [5, 75_000, 60_000],
    [6, 85_000, 70_000],
    [8, 85_000, 70_000],
  ])("%i personas: $%i por noche con 2 noches y $%i con 3", (personas, precioDos, precioTres) => {
    expect(cotizar(personas, DOS)).toMatchObject({ precioNoche: precioDos, total: 2 * precioDos });
    expect(cotizar(personas, TRES)).toMatchObject({ precioNoche: precioTres, total: 3 * precioTres });
  });

  it("rechaza 0 personas", () => {
    expect(() => cotizar(0, DOS)).toThrow(PersonasInvalidasError);
    expect(() => cotizar(0, DOS)).toThrow("Debe venir al menos 1 persona.");
    expect(() => cotizar(-1, DOS)).toThrow(PersonasInvalidasError);
    expect(() => cotizar(2.5, DOS)).toThrow(PersonasInvalidasError);
  });

  it("rechaza 9 personas (más que la capacidad) con mensaje claro", () => {
    expect(() => cotizar(9, DOS)).toThrow(PersonasInvalidasError);
    expect(() => cotizar(9, DOS)).toThrow("La cabaña es para un máximo de 8 personas.");
  });

  it("no cobra 0 si falta la tarifa para el grupo: falla con error claro", () => {
    // Aunque la cabaña admitiera 9, no hay tarifa para 9 personas.
    const intento = () => cotizar(9, DOS, tarifas, { ...cabana, capacidad: 10 });
    expect(intento).toThrow(SinTarifaError);
    expect(intento).toThrow('La cabaña "Cabaña Maicolpue" no tiene tarifa para 9 personas y 2 noches.');
    expect(() => cotizar(2, DOS, [])).toThrow(SinTarifaError);
  });

  it("falla si dos tarifas aplican al mismo grupo y largo de estadía", () => {
    const traslapadas = [...tarifas, { personasDesde: 2, personasHasta: 4, nochesDesde: 3, precioNoche: 55_000 }];
    expect(() => cotizar(4, TRES, traslapadas)).toThrow(TarifasTraslapadasError);
  });

  describe("estadía mínima (min_noches de la cabaña)", () => {
    it("rechaza 1 noche y acepta 2", () => {
      expect(() => cotizar(2, ["2027-01-10", "2027-01-11"])).toThrow(MinimoNochesError);
      expect(() => cotizar(2, ["2027-01-10", "2027-01-11"])).toThrow("Estadía mínima: 2 noches.");
      expect(cotizar(2, DOS).noches).toBe(2);
    });

    it("usa el mínimo de cada cabaña", () => {
      expect(() => cotizar(2, DOS, tarifas, { ...cabana, minNoches: 3 })).toThrow("Estadía mínima: 3 noches.");
      expect(cotizar(2, ["2027-01-10", "2027-01-11"], tarifas, { ...cabana, minNoches: 1 }).total).toBe(65_000);
    });
  });

  it("acepta Date a medianoche UTC, como las entrega Prisma", () => {
    const c = calcularPrecio({
      cabana,
      tarifas,
      checkIn: new Date("2027-01-10T00:00:00Z"),
      checkOut: new Date("2027-01-13T00:00:00Z"),
      personas: 4,
    });
    expect(c.total).toBe(180_000);
  });

  it("rechaza fechas al revés", () => {
    expect(() => cotizar(2, ["2027-01-12", "2027-01-10"])).toThrow(RangoInvalidoError);
  });
});

describe("precioDesde", () => {
  it("devuelve el menor precio por noche de la cabaña", () => {
    expect(precioDesde(tarifas)).toBe(50_000);
  });

  it("devuelve null si la cabaña no tiene tarifas", () => {
    expect(precioDesde([])).toBeNull();
  });
});

describe("calcularAbono", () => {
  it("ejemplo del dueño: total $180.000 → abono $90.000 y saldo $90.000", () => {
    expect(calcularAbono(180_000, 50)).toEqual({ abono: 90_000, saldo: 90_000 });
  });

  it("usa el porcentaje que se le pasa (abono_pct de la cabaña)", () => {
    expect(calcularAbono(180_000, 30)).toEqual({ abono: 54_000, saldo: 126_000 });
    expect(calcularAbono(180_000, 100)).toEqual({ abono: 180_000, saldo: 0 });
    expect(calcularAbono(180_000, 0)).toEqual({ abono: 0, saldo: 180_000 });
  });

  it("redondea al peso y abono + saldo = total, incluso con total impar", () => {
    expect(calcularAbono(75_001, 50)).toEqual({ abono: 37_501, saldo: 37_500 });
    expect(calcularAbono(100_001, 33)).toEqual({ abono: 33_000, saldo: 67_001 });
    for (const total of [1, 3, 99_999, 130_001, 175_555]) {
      for (const pct of [30, 33, 50, 67]) {
        const { abono, saldo } = calcularAbono(total, pct);
        expect(Number.isInteger(abono) && Number.isInteger(saldo)).toBe(true);
        expect(abono + saldo).toBe(total);
      }
    }
  });

  it("rechaza montos o porcentajes inválidos", () => {
    expect(() => calcularAbono(1000.5, 50)).toThrow();
    expect(() => calcularAbono(-1, 50)).toThrow();
    expect(() => calcularAbono(1000, 101)).toThrow();
    expect(() => calcularAbono(1000, 12.5)).toThrow();
  });
});

describe("saldoReserva", () => {
  it("es el total menos el abono guardado en la reserva", () => {
    expect(saldoReserva({ total: 180_000, abono: 90_000 })).toBe(90_000);
    expect(saldoReserva({ total: 75_001, ...calcularAbono(75_001, 50) })).toBe(37_500);
  });
});
