import { describe, expect, it } from "vitest";
import { conflictos, describirRango, nombreMotivo, rangoDeBloqueo, seSuperponen } from "@/lib/bloqueos";
import { formatearFechaLarga } from "@/lib/formato";

const r = (desde: string, hasta: string) => ({ desde, hasta });

describe("seSuperponen: bloqueo contra reserva (en ambos sentidos)", () => {
  const reserva = r("2026-11-10", "2026-11-13"); // noches 10, 11 y 12

  it.each([
    ["bloqueo que empieza dentro de la reserva", r("2026-11-12", "2026-11-15")],
    ["bloqueo que termina dentro de la reserva", r("2026-11-08", "2026-11-11")],
    ["bloqueo dentro de la reserva", r("2026-11-11", "2026-11-12")],
    ["bloqueo que cubre toda la reserva", r("2026-11-01", "2026-11-30")],
    ["bloqueo exactamente igual", r("2026-11-10", "2026-11-13")],
  ])("%s se superpone, y la reserva con el bloqueo también", (_, bloqueo) => {
    expect(seSuperponen(bloqueo, reserva)).toBe(true);
    expect(seSuperponen(reserva, bloqueo)).toBe(true);
  });

  it.each([
    ["bloqueo que libera el día que llega el huésped", r("2026-11-07", "2026-11-10")],
    ["bloqueo que empieza el día que sale el huésped", r("2026-11-13", "2026-11-16")],
    ["bloqueo lejos", r("2026-12-01", "2026-12-05")],
  ])("%s no se superpone, en ningún sentido", (_, bloqueo) => {
    expect(seSuperponen(bloqueo, reserva)).toBe(false);
    expect(seSuperponen(reserva, bloqueo)).toBe(false);
  });

  it("acepta fechas como Date de Prisma", () => {
    const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
    expect(seSuperponen({ desde: d("2026-11-12"), hasta: d("2026-11-14") }, reserva)).toBe(true);
  });
});

describe("rangoDeBloqueo", () => {
  const hoy = "2026-10-11";

  it("convierte primera y última noche (inclusive) a [desde, hasta)", () => {
    expect(rangoDeBloqueo({ primeraNoche: "2026-11-10", ultimaNoche: "2026-11-12", hoy })).toEqual({
      ok: true,
      rango: { desde: "2026-11-10", hasta: "2026-11-13", noches: 3 },
    });
  });

  it("una sola noche, y cruzando el cambio de mes", () => {
    expect(rangoDeBloqueo({ primeraNoche: "2026-10-31", ultimaNoche: "2026-10-31", hoy })).toMatchObject({
      rango: { desde: "2026-10-31", hasta: "2026-11-01", noches: 1 },
    });
    expect(rangoDeBloqueo({ primeraNoche: "2026-10-30", ultimaNoche: "2026-11-02", hoy })).toMatchObject({ rango: { noches: 4 } });
  });

  it("rechaza rangos invertidos, pasados, vacíos o de más de un año", () => {
    expect(rangoDeBloqueo({ primeraNoche: "2026-11-12", ultimaNoche: "2026-11-10", hoy }).ok).toBe(false);
    expect(rangoDeBloqueo({ primeraNoche: "2026-10-10", ultimaNoche: "2026-10-12", hoy }).ok).toBe(false);
    expect(rangoDeBloqueo({ primeraNoche: "", ultimaNoche: "2026-10-12", hoy }).ok).toBe(false);
    expect(rangoDeBloqueo({ primeraNoche: "2026-10-11", ultimaNoche: "2027-10-11", hoy }).ok).toBe(true); // 366 noches
    expect(rangoDeBloqueo({ primeraNoche: "2026-10-11", ultimaNoche: "2027-10-12", hoy }).ok).toBe(false);
  });

  it("hoy sí se puede bloquear", () => {
    expect(rangoDeBloqueo({ primeraNoche: hoy, ultimaNoche: hoy, hoy }).ok).toBe(true);
  });
});

describe("conflictos", () => {
  it("devuelve solo lo que se superpone, ordenado por fecha", () => {
    const reservas = [
      { codigo: "MA-C", ...r("2026-11-20", "2026-11-22") },
      { codigo: "MA-A", ...r("2026-11-05", "2026-11-08") },
      { codigo: "MA-B", ...r("2026-11-08", "2026-11-10") }, // llega el día que se libera MA-A
    ];
    expect(conflictos(r("2026-11-07", "2026-11-09"), reservas).map((x) => x.codigo)).toEqual(["MA-A", "MA-B"]);
    expect(conflictos(r("2026-11-10", "2026-11-20"), reservas)).toEqual([]);
  });
});

describe("textos", () => {
  it("describe el rango con la última noche, no con el día en que se libera", () => {
    expect(describirRango(r("2026-11-10", "2026-11-13"), formatearFechaLarga)).toBe(
      "10 de noviembre de 2026 al 12 de noviembre de 2026 (3 noches)",
    );
    expect(describirRango(r("2026-11-10", "2026-11-11"), formatearFechaLarga)).toBe("noche del 10 de noviembre de 2026 (1 noche)");
  });

  it("nombra los motivos y muestra textos libres tal cual", () => {
    expect(nombreMotivo("airbnb")).toBe("Reservada en Airbnb");
    expect(nombreMotivo("Pintura de la terraza")).toBe("Pintura de la terraza");
    expect(nombreMotivo(null)).toBe("Sin motivo");
  });
});
