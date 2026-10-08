import { describe, expect, it } from "vitest";
import { bloqueoPublicacion, datosPendientes, type DatosPublicacion } from "./publicacion";

const completa: DatosPublicacion = {
  ubicacion: "Puerto Varas · Lago Llanquihue",
  whatsapp: "+56947637541",
  email: "contacto@solucionesdys.cl",
  instruccionesLlegada: "Check-in desde las 15:00 y check-out hasta las 11:00.",
  politicaCancelacion: "Cancelación sin costo hasta 15 días antes.",
};

// Como la deja el seed de Maicolpue: valores de ejemplo marcados PENDIENTE.
const maicolpue: DatosPublicacion = {
  ubicacion: "Maicolpue · San Juan de la Costa (PENDIENTE)",
  whatsapp: "PENDIENTE",
  email: "PENDIENTE",
  instruccionesLlegada: "PENDIENTE: check-in desde las 15:00 y check-out hasta las 11:00.",
  politicaCancelacion: "PENDIENTE: cancelación sin costo hasta 15 días antes.",
};

describe("datosPendientes", () => {
  it("no hay pendientes con todos los datos confirmados", () => {
    expect(datosPendientes(completa)).toEqual([]);
  });

  it("lista los datos marcados PENDIENTE (sin importar mayúsculas) o vacíos", () => {
    expect(datosPendientes(maicolpue)).toEqual([
      "ubicación",
      "WhatsApp",
      "email de avisos",
      "instrucciones de llegada y horarios de check-in/out",
      "política de cancelación",
    ]);
    expect(datosPendientes({ ...completa, whatsapp: "pendiente", ubicacion: null, email: "  " })).toEqual([
      "ubicación",
      "WhatsApp",
      "email de avisos",
    ]);
  });
});

describe("bloqueoPublicacion", () => {
  it("bloquea publicar y cobrar mientras quede algún PENDIENTE, con mensaje claro", () => {
    expect(bloqueoPublicacion({ ...completa, whatsapp: "PENDIENTE" }, false)).toBe(
      "Esta cabaña todavía no recibe reservas: faltan datos por confirmar (WhatsApp).",
    );
    expect(bloqueoPublicacion(maicolpue, false)).toMatch(/^Esta cabaña todavía no recibe reservas: faltan datos/);
  });

  it("no bloquea con todos los datos confirmados", () => {
    expect(bloqueoPublicacion(completa, false)).toBeNull();
  });

  it("en modo prueba deja probar con datos de ejemplo", () => {
    expect(bloqueoPublicacion(maicolpue, true)).toBeNull();
  });
});
