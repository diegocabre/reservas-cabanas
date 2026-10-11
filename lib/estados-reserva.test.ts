import { describe, expect, it } from "vitest";
import {
  accionesDisponibles,
  marcarPagoRevisado,
  tieneRevisarPago,
  validarMotivo,
  validarPagoSaldo,
  validarTransicion,
  type EstadoReserva,
} from "@/lib/estados-reserva";

const ESTADOS: EstadoReserva[] = ["pendiente_pago", "confirmada", "cancelada", "completada"];

describe("validarTransicion: confirmar", () => {
  it.each<EstadoReserva>(["pendiente_pago", "cancelada"])("se puede confirmar una reserva %s", (estado) => {
    expect(validarTransicion("confirmar", estado)).toEqual({ ok: true, hacia: "confirmada" });
  });

  it.each([
    ["confirmada", "ya está confirmada"],
    ["completada", "ya terminó"],
  ] as const)("no se puede confirmar una reserva %s", (estado, motivo) => {
    const r = validarTransicion("confirmar", estado);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(motivo);
  });
});

describe("validarTransicion: cancelar", () => {
  it.each<EstadoReserva>(["pendiente_pago", "confirmada"])("se puede cancelar una reserva %s", (estado) => {
    expect(validarTransicion("cancelar", estado)).toEqual({ ok: true, hacia: "cancelada" });
  });

  it.each([
    ["cancelada", "ya está cancelada"],
    ["completada", "ya terminó"],
  ] as const)("no se puede cancelar una reserva %s", (estado, motivo) => {
    const r = validarTransicion("cancelar", estado);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(motivo);
  });

  it("cada estado tiene una respuesta para cada acción (matriz completa)", () => {
    const matriz = Object.fromEntries(
      ESTADOS.map((e) => [e, [validarTransicion("confirmar", e).ok, validarTransicion("cancelar", e).ok]]),
    );
    expect(matriz).toEqual({
      pendiente_pago: [true, true],
      confirmada: [false, true],
      cancelada: [true, false],
      completada: [false, false],
    });
  });
});

describe("validarMotivo", () => {
  it("exige un motivo real y lo limpia", () => {
    expect(validarMotivo("   ").ok).toBe(false);
    expect(validarMotivo("no").ok).toBe(false);
    expect(validarMotivo("  El huésped canceló por WhatsApp  ")).toEqual({ ok: true, motivo: "El huésped canceló por WhatsApp" });
    expect(validarMotivo("x".repeat(501)).ok).toBe(false);
  });
});

describe("validarPagoSaldo", () => {
  const base = { estado: "confirmada" as EstadoReserva, total: 240_000, pagado: 120_000, fecha: "2026-10-11", hoy: "2026-10-11" };

  it("acepta pagar el saldo exacto o una parte", () => {
    expect(validarPagoSaldo({ ...base, monto: 120_000 })).toEqual({ ok: true });
    expect(validarPagoSaldo({ ...base, monto: 50_000 })).toEqual({ ok: true });
  });

  it("impide que abono + saldo supere el total", () => {
    const r = validarPagoSaldo({ ...base, monto: 120_001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("$120.000");
  });

  it("impide pagar una reserva ya pagada completa", () => {
    const r = validarPagoSaldo({ ...base, pagado: 240_000, monto: 1 });
    expect(r).toEqual({ ok: false, error: "Esta reserva ya está pagada completa." });
  });

  it("rechaza montos no enteros, cero o negativos", () => {
    for (const monto of [0, -5_000, 1_000.5, Number.NaN]) expect(validarPagoSaldo({ ...base, monto }).ok).toBe(false);
  });

  it("rechaza fechas futuras o inválidas", () => {
    expect(validarPagoSaldo({ ...base, monto: 1_000, fecha: "2026-10-12" }).ok).toBe(false);
    expect(validarPagoSaldo({ ...base, monto: 1_000, fecha: "" }).ok).toBe(false);
    expect(validarPagoSaldo({ ...base, monto: 1_000, fecha: "2026-09-30" }).ok).toBe(true);
  });

  it("no acepta pagos en una cancelada, sí en pendiente o completada", () => {
    expect(validarPagoSaldo({ ...base, estado: "cancelada", monto: 1_000 }).ok).toBe(false);
    expect(validarPagoSaldo({ ...base, estado: "pendiente_pago", monto: 1_000 }).ok).toBe(true);
    expect(validarPagoSaldo({ ...base, estado: "completada", monto: 1_000 }).ok).toBe(true);
  });
});

describe("pago en revisión", () => {
  it("marca las líneas [REVISAR PAGO] como revisadas sin borrar el resto", () => {
    const notas = "[PRUEBA] llegan tarde\n[REVISAR PAGO] pago 9 aprobado por $1, distinto al abono";
    expect(tieneRevisarPago(notas)).toBe(true);
    const revisadas = marcarPagoRevisado(notas);
    expect(revisadas).toBe("[PRUEBA] llegan tarde\n[PAGO REVISADO] pago 9 aprobado por $1, distinto al abono");
    expect(tieneRevisarPago(revisadas)).toBe(false);
    expect(marcarPagoRevisado(null)).toBeNull();
  });
});

describe("accionesDisponibles", () => {
  it("ofrece solo lo que el estado permite", () => {
    expect(accionesDisponibles({ estado: "confirmada", total: 100, pagado: 50, notas: null })).toEqual({
      confirmar: false,
      cancelar: true,
      registrarPago: true,
      marcarRevisado: false,
    });
    expect(accionesDisponibles({ estado: "cancelada", total: 100, pagado: 50, notas: "[REVISAR PAGO] x" })).toEqual({
      confirmar: true,
      cancelar: false,
      registrarPago: false,
      marcarRevisado: true,
    });
    expect(accionesDisponibles({ estado: "completada", total: 100, pagado: 100, notas: null })).toEqual({
      confirmar: false,
      cancelar: false,
      registrarPago: false,
      marcarRevisado: false,
    });
  });
});
