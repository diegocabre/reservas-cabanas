import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { CAMPO_MARCA, CAMPO_SENUELO, firmarMarca, verificarAntiBot } from "./anti-bot";

const S = "secreto";
const T0 = new Date("2026-10-16T12:00:00Z");
const despues = (ms: number) => new Date(T0.getTime() + ms);
const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe("verificarAntiBot", () => {
  it("un huésped que tarda lo normal pasa", () => {
    const f = form({ [CAMPO_SENUELO]: "", [CAMPO_MARCA]: firmarMarca(T0, S) });
    expect(verificarAntiBot(f, { exigirMarca: true, ahora: despues(45_000), secreto: S })).toEqual({ ok: true });
  });

  it("señuelo con texto: bot", () => {
    const f = form({ [CAMPO_SENUELO]: "http://spam", [CAMPO_MARCA]: firmarMarca(T0, S) });
    expect(verificarAntiBot(f, { exigirMarca: true, ahora: despues(45_000), secreto: S })).toEqual({ ok: false, motivo: "senuelo" });
    expect(verificarAntiBot(f, { exigirMarca: false, secreto: S })).toEqual({ ok: false, motivo: "senuelo" });
  });

  it("envío instantáneo: bot", () => {
    const f = form({ [CAMPO_MARCA]: firmarMarca(T0, S) });
    expect(verificarAntiBot(f, { exigirMarca: true, ahora: despues(1_000), secreto: S })).toEqual({ ok: false, motivo: "muy_rapido" });
  });

  it("marca de hace más de 24 horas: vencida", () => {
    const f = form({ [CAMPO_MARCA]: firmarMarca(T0, S) });
    expect(verificarAntiBot(f, { exigirMarca: true, ahora: despues(25 * 3_600_000), secreto: S })).toEqual({ ok: false, motivo: "marca_vencida" });
  });

  it("marca inventada o con otra firma: inválida", () => {
    const ajena = firmarMarca(T0, "otro");
    expect(verificarAntiBot(form({ [CAMPO_MARCA]: ajena }), { exigirMarca: true, ahora: despues(10_000), secreto: S })).toEqual({ ok: false, motivo: "marca_invalida" });
    expect(verificarAntiBot(form({ [CAMPO_MARCA]: "123.abc" }), { exigirMarca: true, ahora: despues(10_000), secreto: S })).toEqual({ ok: false, motivo: "marca_invalida" });
    // Cambiar la hora invalida la firma.
    const [, firmaReal] = firmarMarca(T0, S).split(".");
    const antigua = `${T0.getTime() - 3_600_000}.${firmaReal}`;
    expect(verificarAntiBot(form({ [CAMPO_MARCA]: antigua }), { exigirMarca: true, ahora: despues(10_000), secreto: S })).toEqual({ ok: false, motivo: "marca_invalida" });
  });

  it("sin marca: rechazado solo si se exige", () => {
    expect(verificarAntiBot(form({}), { exigirMarca: true, secreto: S })).toEqual({ ok: false, motivo: "sin_marca" });
    expect(verificarAntiBot(form({}), { exigirMarca: false, secreto: S })).toEqual({ ok: true });
  });
});
