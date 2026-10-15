import { describe, expect, it } from "vitest";
import { normalizarTelefono } from "@/lib/reserva-esquema";
import { botonWhatsappAprobacion, limpiarMotivoRechazo, recordarAlDueno, recordarAlHuesped } from "@/lib/solicitudes";
import { mensajeAprobacion } from "@/lib/whatsapp";

const ahora = new Date("2026-10-15T15:00:00Z");
const enHoras = (h: number) => new Date(ahora.getTime() + h * 3_600_000);

describe("normalizarTelefono: celulares chilenos", () => {
  it.each([
    ["+56 9 1234 5678", "+56912345678"],
    ["+56912345678", "+56912345678"],
    ["56912345678", "+56912345678"],
    ["912345678", "+56912345678"],
    ["9 1234 5678", "+56912345678"],
    ["9-1234-5678", "+56912345678"],
    ["+56 9-1234-5678", "+56912345678"],
    ["(+56) 9 1234 5678", "+56912345678"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado);
  });

  it("rechaza números que no son celulares", () => {
    expect(normalizarTelefono("1234")).toBeNull();
    expect(normalizarTelefono("812345678")).toBeNull();
    expect(normalizarTelefono("")).toBeNull();
  });
});

const base = {
  huespedNombre: "Íñigo Muñoz",
  huespedTelefono: "+56912345678",
  cabana: "Cabaña Ñirre & Lago",
  checkIn: "2026-12-20",
  checkOut: "2026-12-23",
  linkPago: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=123-abc&x=1",
  linkPagoExpiraEn: enHoras(20),
  ahora,
};

describe("botonWhatsappAprobacion", () => {
  it("arma el link wa.me con el número sin + ni espacios y el mensaje codificado", () => {
    const b = botonWhatsappAprobacion({ ...base, huespedTelefono: "+56 9 1234 5678" });
    expect(b.habilitado).toBe(true);
    if (!b.habilitado) return;
    const url = new URL(b.url);
    expect(url.origin + url.pathname).toBe("https://wa.me/56912345678");
    // Tildes, ñ, signos (¡ ! & ?) y el link de pago llegan intactos al decodificar.
    const texto = url.searchParams.get("text")!;
    expect(texto).toBe(
      mensajeAprobacion({
        nombre: "Íñigo Muñoz",
        cabana: "Cabaña Ñirre & Lago",
        checkIn: "2026-12-20",
        checkOut: "2026-12-23",
        linkPago: base.linkPago,
        limite: "16 de octubre de 2026 a las 08:00",
      }),
    );
    expect(texto).toContain("Hola Íñigo, te escribo de Cabaña Ñirre & Lago. ¡Aprobé tu solicitud");
    expect(texto).toContain(base.linkPago);
    // encodeURIComponent: sin espacios ni & sueltos que corten el parámetro.
    expect(b.url).not.toMatch(/ /);
    expect(b.url.split("?text=")[1]).not.toContain("&");
    expect(b.url).toContain("%C3%91irre%20%26%20Lago");
  });

  it("se deshabilita sin teléfono", () => {
    expect(botonWhatsappAprobacion({ ...base, huespedTelefono: "" })).toEqual({
      habilitado: false,
      motivo: "El huésped no dejó un teléfono válido.",
      puedeRenovar: false,
    });
  });

  it("se deshabilita con el link vencido y ofrece generar otro", () => {
    expect(botonWhatsappAprobacion({ ...base, linkPagoExpiraEn: enHoras(-1) })).toEqual({
      habilitado: false,
      motivo: "El link de pago venció.",
      puedeRenovar: true,
    });
    expect(botonWhatsappAprobacion({ ...base, linkPagoExpiraEn: ahora }).habilitado).toBe(false);
  });

  it("se deshabilita si todavía no hay link", () => {
    expect(botonWhatsappAprobacion({ ...base, linkPago: null }).habilitado).toBe(false);
  });
});

describe("recordatorios", () => {
  it("al dueño: una vez, en las últimas 6 horas del plazo", () => {
    expect(recordarAlDueno({ expiraEn: enHoras(7), recordatorioDuenoEn: null }, ahora)).toBe(false);
    expect(recordarAlDueno({ expiraEn: enHoras(5), recordatorioDuenoEn: null }, ahora)).toBe(true);
    expect(recordarAlDueno({ expiraEn: enHoras(5), recordatorioDuenoEn: ahora }, ahora)).toBe(false);
    expect(recordarAlDueno({ expiraEn: enHoras(-1), recordatorioDuenoEn: null }, ahora)).toBe(false);
  });

  it("al huésped: unas 6 horas antes de que venza el link, una vez", () => {
    const aprobada = { aprobadaEn: enHoras(-20), recordatorioHuespedEn: null };
    expect(recordarAlHuesped({ ...aprobada, linkPagoExpiraEn: enHoras(7) }, ahora)).toBe(false);
    expect(recordarAlHuesped({ ...aprobada, linkPagoExpiraEn: enHoras(5) }, ahora)).toBe(true);
    expect(recordarAlHuesped({ ...aprobada, linkPagoExpiraEn: enHoras(5), recordatorioHuespedEn: ahora }, ahora)).toBe(false);
    expect(recordarAlHuesped({ ...aprobada, linkPagoExpiraEn: enHoras(-1) }, ahora)).toBe(false);
  });

  it("al huésped: no si el link dura menos de 6 horas (el correo de aprobación es reciente)", () => {
    expect(recordarAlHuesped({ aprobadaEn: enHoras(-1), linkPagoExpiraEn: enHoras(3), recordatorioHuespedEn: null }, ahora)).toBe(false);
  });
});

describe("limpiarMotivoRechazo", () => {
  it("es opcional y se acota", () => {
    expect(limpiarMotivoRechazo("   ")).toBeNull();
    expect(limpiarMotivoRechazo(undefined)).toBeNull();
    expect(limpiarMotivoRechazo("  Ya tenía esas fechas  ")).toBe("Ya tenía esas fechas");
    expect(limpiarMotivoRechazo("x".repeat(900))).toHaveLength(500);
  });
});
