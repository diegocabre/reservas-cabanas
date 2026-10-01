import { describe, expect, it } from "vitest";
import {
  calcularAbono,
  calcularPrecio,
  MinimoNochesError,
  NocheSinTemporadaError,
  nochesEntre,
  precioDesde,
  RangoInvalidoError,
  TemporadasTraslapadasError,
  type TemporadaPrecio,
} from "./precios";

// Mismas temporadas que el seed para la Cabaña Volcán Osorno (rangos [desde, hasta)).
const cabana = { nombre: "Cabaña Volcán Osorno", minNoches: 2 };
const temporadas: TemporadaPrecio[] = [
  { nombre: "Baja", desde: "2026-10-01", hasta: "2026-12-15", precioNoche: 75_000, minNoches: null },
  { nombre: "Alta 2026-27", desde: "2026-12-15", hasta: "2027-03-01", precioNoche: 120_000, minNoches: 3 },
  { nombre: "Media marzo", desde: "2027-03-01", hasta: "2027-04-01", precioNoche: 95_000, minNoches: null },
  { nombre: "Baja", desde: "2027-04-01", hasta: "2027-09-17", precioNoche: 75_000, minNoches: null },
  { nombre: "Fiestas Patrias", desde: "2027-09-17", hasta: "2027-09-21", precioNoche: 95_000, minNoches: null },
  { nombre: "Baja", desde: "2027-09-21", hasta: "2027-12-15", precioNoche: 75_000, minNoches: null },
];

const cotizar = (checkIn: string, checkOut: string, ts = temporadas) =>
  calcularPrecio({ cabana, temporadas: ts, checkIn, checkOut });

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
  it("cobra todas las noches con la temporada que las cubre", () => {
    const c = cotizar("2027-05-10", "2027-05-13");
    expect(c.noches).toBe(3);
    expect(c.total).toBe(225_000);
    expect(c.detalle.every((n) => n.temporada === "Baja" && n.precio === 75_000)).toBe(true);
  });

  it("calcula noche por noche cuando la estadía cruza temporadas", () => {
    // 13 y 14 dic en baja; 15, 16 y 17 en alta.
    const c = cotizar("2026-12-13", "2026-12-18");
    expect(c.detalle.map((n) => n.precio)).toEqual([75_000, 75_000, 120_000, 120_000, 120_000]);
    expect(c.total).toBe(510_000);
  });

  it("trata el hasta de la temporada como exclusivo", () => {
    // La noche del 1 mar ya es media, no alta (alta tiene hasta = 2027-03-01).
    const c = cotizar("2027-02-27", "2027-03-02");
    expect(c.detalle.map((n) => [n.fecha, n.temporada])).toEqual([
      ["2027-02-27", "Alta 2026-27"],
      ["2027-02-28", "Alta 2026-27"],
      ["2027-03-01", "Media marzo"],
    ]);
    expect(c.total).toBe(335_000);
  });

  it("aplica fiestas patrias del 17 al 20 de septiembre (noches), no el 21", () => {
    const c = cotizar("2027-09-16", "2027-09-22");
    expect(c.detalle.map((n) => n.precio)).toEqual([75_000, 95_000, 95_000, 95_000, 95_000, 75_000]);
  });

  it("acepta Date a medianoche UTC, como las entrega Prisma", () => {
    const c = calcularPrecio({
      cabana,
      temporadas: temporadas.map((t) => ({ ...t, desde: new Date(`${t.desde}T00:00:00Z`), hasta: new Date(`${t.hasta}T00:00:00Z`) })),
      checkIn: new Date("2027-05-10T00:00:00Z"),
      checkOut: new Date("2027-05-13T00:00:00Z"),
    });
    expect(c.total).toBe(225_000);
  });

  describe("noche sin temporada", () => {
    it("falla con error claro en vez de cobrar 0", () => {
      // Las temporadas terminan el 2027-12-15 (exclusivo): la noche del 15 no tiene precio.
      const intento = () => cotizar("2027-12-13", "2027-12-17");
      expect(intento).toThrow(NocheSinTemporadaError);
      expect(intento).toThrow('La cabaña "Cabaña Volcán Osorno" no tiene temporada configurada para la noche del 2027-12-15');
    });

    it("informa la cabaña y la primera fecha sin temporada", () => {
      const conHueco = temporadas.filter((t) => t.nombre !== "Media marzo");
      try {
        cotizar("2027-02-27", "2027-03-03", conHueco);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(NocheSinTemporadaError);
        expect(e).toMatchObject({ cabana: "Cabaña Volcán Osorno", fecha: "2027-03-01" });
      }
    });

    it("falla si la cabaña no tiene ninguna temporada", () => {
      expect(() => cotizar("2027-05-10", "2027-05-13", [])).toThrow(NocheSinTemporadaError);
    });
  });

  it("falla si dos temporadas cubren la misma noche", () => {
    const traslapadas = [
      ...temporadas,
      { nombre: "Promo mayo", desde: "2027-05-01", hasta: "2027-05-15", precioNoche: 60_000, minNoches: null },
    ];
    expect(() => cotizar("2027-05-10", "2027-05-13", traslapadas)).toThrow(TemporadasTraslapadasError);
  });

  describe("mínimo de noches", () => {
    it("usa el mínimo de la cabaña si la temporada no define uno", () => {
      expect(() => cotizar("2027-05-10", "2027-05-11")).toThrow(MinimoNochesError);
      expect(cotizar("2027-05-10", "2027-05-12").minNoches).toBe(2);
    });

    it("usa el mínimo de la temporada alta", () => {
      expect(() => cotizar("2027-01-10", "2027-01-12")).toThrow("La estadía mínima para estas fechas es de 3 noches (elegiste 2).");
      expect(cotizar("2027-01-10", "2027-01-13").noches).toBe(3);
    });

    it("exige el mayor mínimo entre las temporadas que toca la estadía", () => {
      // 13 y 14 dic en baja (mín 2) + 15 dic en alta (mín 3): se exigen 3 y hay 3.
      expect(cotizar("2026-12-13", "2026-12-16").minNoches).toBe(3);
      // 14 dic baja + 15 dic alta: 2 noches no alcanzan.
      expect(() => cotizar("2026-12-14", "2026-12-16")).toThrow(MinimoNochesError);
    });
  });
});

describe("precioDesde", () => {
  it("devuelve el menor precio entre las temporadas vigentes", () => {
    expect(precioDesde(temporadas, "2026-10-01")).toBe(75_000);
  });

  it("ignora temporadas que ya terminaron (hasta es exclusivo)", () => {
    const ts = [
      { hasta: "2026-12-15", precioNoche: 75_000 },
      { hasta: "2027-03-01", precioNoche: 120_000 },
    ];
    expect(precioDesde(ts, "2026-12-14")).toBe(75_000);
    expect(precioDesde(ts, "2026-12-15")).toBe(120_000); // la baja terminó el 14
  });

  it("devuelve null si no queda ninguna temporada vigente", () => {
    expect(precioDesde(temporadas, "2028-01-01")).toBeNull();
    expect(precioDesde([], "2026-10-01")).toBeNull();
  });
});

describe("calcularAbono", () => {
  it("calcula el porcentaje del total", () => {
    expect(calcularAbono(225_000, 50)).toBe(112_500);
    expect(calcularAbono(510_000, 30)).toBe(153_000);
    expect(calcularAbono(510_000, 100)).toBe(510_000);
  });

  it("redondea al peso", () => {
    expect(calcularAbono(75_001, 50)).toBe(37_501);
    expect(calcularAbono(100_000, 33)).toBe(33_000);
  });

  it("rechaza montos o porcentajes inválidos", () => {
    expect(() => calcularAbono(1000.5, 50)).toThrow();
    expect(() => calcularAbono(-1, 50)).toThrow();
    expect(() => calcularAbono(1000, 101)).toThrow();
    expect(() => calcularAbono(1000, 12.5)).toThrow();
  });
});
