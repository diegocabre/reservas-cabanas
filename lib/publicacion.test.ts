import { describe, expect, it } from "vitest";
import {
  bloqueoCobro,
  bloqueoPublicacion,
  bloqueoReserva,
  datosPendientes,
  MENSAJE_DEMO_SIN_COBRO,
  MENSAJE_DEMO_SIN_RESERVAS,
  MENSAJE_SIN_PAGO_EN_LINEA,
  type DatosPublicacion,
} from "./publicacion";

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

describe("cabañas demo", () => {
  const demo = { demo: true, propiedad: completa };
  const real = { demo: false, propiedad: completa };

  it("nunca cobran, ni en modo prueba ni fuera de él", () => {
    expect(bloqueoCobro(demo, true)).toBe(MENSAJE_DEMO_SIN_COBRO);
    expect(bloqueoCobro(demo, false)).toBe(MENSAJE_DEMO_SIN_COBRO);
  });

  it("solo se pueden reservar en modo prueba (para mostrar el sistema)", () => {
    expect(bloqueoReserva(demo, true)).toBeNull();
    expect(bloqueoReserva(demo, false)).toBe(MENSAJE_DEMO_SIN_RESERVAS);
  });

  it("una cabaña real con datos completos reserva y cobra", () => {
    expect(bloqueoReserva(real, false)).toBeNull();
    expect(bloqueoCobro(real, false)).toBeNull();
    expect(bloqueoCobro(real, true)).toBeNull();
  });

  it("una cabaña real con datos PENDIENTE solo reserva y cobra en modo prueba", () => {
    const pendiente = { demo: false, propiedad: maicolpue };
    expect(bloqueoCobro(pendiente, true)).toBeNull();
    expect(bloqueoCobro(pendiente, false)).toMatch(/faltan datos por confirmar/);
    expect(bloqueoReserva(pendiente, false)).toMatch(/faltan datos por confirmar/);
  });
});

describe("sin Mercado Pago conectado", () => {
  const real = {
    demo: false,
    propiedad: {
      ubicacion: "Maicolpue",
      whatsapp: "+56941676239",
      email: "dueno@example.com",
      instruccionesLlegada: "Check-in 14:00",
      politicaCancelacion: "Sin devolución",
    },
  };

  it("fuera del modo prueba no recibe reservas en línea: se reserva por WhatsApp", () => {
    expect(bloqueoReserva(real, false, false)).toBe(MENSAJE_SIN_PAGO_EN_LINEA);
    expect(bloqueoReserva(real, false, true)).toBeNull();
  });

  it("en modo prueba se puede probar sin cuenta conectada", () => {
    expect(bloqueoReserva(real, true, false)).toBeNull();
  });

  it("los datos pendientes y las demo tienen prioridad sobre la falta de cuenta", () => {
    expect(bloqueoReserva({ ...real, demo: true }, false, false)).toBe(MENSAJE_DEMO_SIN_RESERVAS);
    expect(bloqueoReserva({ ...real, propiedad: { ...real.propiedad, email: "PENDIENTE" } }, false, false)).toContain("faltan datos");
  });
});
