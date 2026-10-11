import { describe, expect, it } from "vitest";
import {
  elegirCredencial,
  generarEstado,
  necesitaRenovar,
  urlAutorizacion,
  urlRetorno,
  vencimiento,
  verificarEstado,
} from "@/lib/mercadopago-oauth";

const PROPIEDAD = "3f0c2a4e-8d1b-4c6a-9e2f-1a2b3c4d5e6f";

describe("urlAutorizacion", () => {
  it("arma la URL de Mercado Pago con los parámetros del SDK oficial", () => {
    const url = new URL(
      urlAutorizacion({ clientId: "123", redirectUri: "https://reservas.solucionesdys.cl/admin/mercadopago/conectado", estado: "abc" }),
    );
    expect(url.origin + url.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "123",
      response_type: "code",
      platform_id: "mp",
      state: "abc",
      redirect_uri: "https://reservas.solucionesdys.cl/admin/mercadopago/conectado",
    });
  });

  it("la URL de retorno es la del sitio", () => {
    expect(urlRetorno(new URL("https://reservas.solucionesdys.cl"))).toBe("https://reservas.solucionesdys.cl/admin/mercadopago/conectado");
  });
});

describe("state del OAuth", () => {
  it("lleva la propiedad y un valor aleatorio, y se verifica contra la cookie", () => {
    const estado = generarEstado(PROPIEDAD, () => "azar123");
    expect(estado).toBe(`${PROPIEDAD}.azar123`);
    expect(verificarEstado(estado, estado)).toBe(PROPIEDAD);
  });

  it("rechaza un state distinto, faltante o con otra propiedad", () => {
    const estado = generarEstado(PROPIEDAD);
    expect(verificarEstado(estado, undefined)).toBeNull();
    expect(verificarEstado(null, estado)).toBeNull();
    expect(verificarEstado(generarEstado(PROPIEDAD), estado)).toBeNull();
    const otraPropiedad = estado.replace(PROPIEDAD, "00000000-0000-0000-0000-000000000000");
    expect(verificarEstado(otraPropiedad, estado)).toBeNull();
    expect(verificarEstado("no-es-uuid.x", "no-es-uuid.x")).toBeNull();
  });

  it("dos conexiones generan valores distintos", () => {
    expect(generarEstado(PROPIEDAD)).not.toBe(generarEstado(PROPIEDAD));
  });
});

describe("vencimiento y renovación", () => {
  const ahora = new Date("2026-10-11T12:00:00Z");

  it("calcula el vencimiento desde expires_in (180 días por defecto)", () => {
    expect(vencimiento(15_552_000, ahora).toISOString()).toBe("2027-04-09T12:00:00.000Z");
    expect(vencimiento(undefined, ahora).toISOString()).toBe("2027-04-09T12:00:00.000Z");
  });

  it("renueva cuando quedan menos de 30 días", () => {
    expect(necesitaRenovar(new Date("2026-12-01T12:00:00Z"), ahora)).toBe(false);
    expect(necesitaRenovar(new Date("2026-11-05T12:00:00Z"), ahora)).toBe(true);
    expect(necesitaRenovar(new Date("2026-10-01T12:00:00Z"), ahora)).toBe(true); // ya vencido
  });
});

describe("elegirCredencial", () => {
  it("cobra siempre con la cuenta del dueño si está conectada", () => {
    for (const modoPrueba of [true, false]) {
      expect(elegirCredencial({ tokenPropiedad: "DUENO", tokenPlataforma: "DYS", modoPrueba })).toEqual({
        ok: true,
        credencial: { origen: "propiedad", accessToken: "DUENO" },
      });
    }
  });

  it("sin cuenta conectada usa la de la plataforma solo en modo prueba", () => {
    expect(elegirCredencial({ tokenPropiedad: null, tokenPlataforma: "DYS", modoPrueba: true })).toMatchObject({
      ok: true,
      credencial: { origen: "plataforma" },
    });
  });

  it("sin cuenta conectada y fuera del modo prueba no cobra: el dinero no pasa por Soluciones DyS", () => {
    expect(elegirCredencial({ tokenPropiedad: null, tokenPlataforma: "DYS", modoPrueba: false })).toMatchObject({ ok: false });
    expect(elegirCredencial({ tokenPropiedad: null, tokenPlataforma: undefined, modoPrueba: true })).toMatchObject({ ok: false });
  });
});
