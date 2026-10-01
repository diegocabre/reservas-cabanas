import { describe, expect, it } from "vitest";
import { formatearCLP, formatearFechaLarga, hoyEnChile } from "./formato";

describe("formatearCLP", () => {
  it("usa punto de miles, signo $ y sin decimales", () => {
    expect(formatearCLP(120_000)).toBe("$120.000");
    expect(formatearCLP(75_000)).toBe("$75.000");
    expect(formatearCLP(1_250_000)).toBe("$1.250.000");
    expect(formatearCLP(990)).toBe("$990");
    expect(formatearCLP(0)).toBe("$0");
  });

  it("rechaza montos con decimales", () => {
    expect(() => formatearCLP(1000.5)).toThrow();
  });
});

describe("hoyEnChile", () => {
  it("usa la hora de Chile, no UTC", () => {
    // 02:00 UTC del 1 oct = 23:00 del 30 sep en Chile (UTC-3 en horario de verano).
    expect(hoyEnChile(new Date("2026-10-01T02:00:00Z"))).toBe("2026-09-30");
    expect(hoyEnChile(new Date("2026-10-01T15:00:00Z"))).toBe("2026-10-01");
  });
});

describe("formatearFechaLarga", () => {
  it("escribe la fecha en español", () => {
    expect(formatearFechaLarga("2027-01-10")).toBe("10 de enero de 2027");
  });
});
