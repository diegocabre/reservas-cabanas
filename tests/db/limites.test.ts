// Límites anti abuso contra la base: reservas pendientes por email y teléfono en una cabaña, noches
// máximas, y la tabla intentos_publicos (contador, ventana y limpieza). npm run test:db.
// Crea datos propios y los borra al final.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

process.env.RESERVAS_MODO_PRUEBA = "true";
process.env.RESEND_API_KEY = "";
process.env.LIMITES_SECRETO = "secreto-de-prueba";
process.env.LIMITE_PENDIENTES_POR_CONTACTO = "2"; // el valor por defecto (la configuración de test:db lo sube)

const { db } = await import("@/lib/db");
const { crearReservaWeb, MENSAJE_PENDIENTES, obtenerReservaPublica } = await import("@/lib/reservas");
const { consumirIntento, limpiarIntentos } = await import("@/lib/limites");

const sufijo = randomUUID().slice(0, 8);
let propiedadId: string, cabanaId: string, cabanaOtra: string, slug: string;

let n = 0;
/** Fechas propias para cada reserva (2027). */
function fechas(noches = 2) {
  n++;
  const checkIn = new Date(Date.UTC(2027, 0, 1) + n * 3 * 86_400_000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.parse(`${checkIn}T00:00:00Z`) + noches * 86_400_000).toISOString().slice(0, 10);
  return { checkIn, checkOut };
}

const reservar = (contacto: { email?: string; telefono?: string } = {}, cabana = "cabana", f = fechas()) =>
  crearReservaWeb({
    propiedad: slug,
    cabana,
    ...f,
    adultos: 2,
    ninos: 0,
    nombre: "Ana Pérez",
    email: contacto.email ?? `ana-${randomUUID().slice(0, 6)}@example.com`,
    telefono: contacto.telefono ?? `+5691${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    rut: "12.345.678-5",
    notas: "",
  });

beforeAll(async () => {
  const p = await db.propiedad.create({
    data: {
      nombre: `Test límites ${sufijo}`,
      slug: `test-lim-${sufijo}`,
      prefijoCodigo: `L${sufijo}`.toUpperCase(),
      whatsapp: "+56900000000",
      email: "dueno@example.com",
    },
  });
  propiedadId = p.id;
  slug = p.slug;
  const crear = (s: string) =>
    db.cabana.create({
      data: {
        propiedadId,
        nombre: s,
        slug: s,
        capacidad: 4,
        dormitorios: 2,
        tarifas: { create: [{ personasDesde: 1, personasHasta: 4, nochesDesde: 1, precioNoche: 60_000 }] },
      },
    });
  cabanaId = (await crear("cabana")).id;
  cabanaOtra = (await crear("otra")).id;
});

afterAll(async () => {
  await db.reserva.deleteMany({ where: { cabanaId: { in: [cabanaId, cabanaOtra].filter(Boolean) } } });
  await db.cabana.deleteMany({ where: { propiedadId } });
  await db.propiedad.deleteMany({ where: { id: propiedadId } });
  await db.intentoPublico.deleteMany({ where: { clave: { startsWith: `test-${sufijo}` } } });
});

describe("reservas pendientes por contacto", () => {
  it("el mismo email puede tener 2 pendientes en la cabaña; la tercera se rechaza", async () => {
    const email = `repite-${sufijo}@example.com`;
    expect((await reservar({ email })).ok).toBe(true);
    expect((await reservar({ email })).ok).toBe(true);
    expect(await reservar({ email })).toEqual({ ok: false, error: MENSAJE_PENDIENTES });
    // En otra cabaña sí puede.
    expect((await reservar({ email }, "otra")).ok).toBe(true);
  });

  it("igual con el mismo teléfono y otro email", async () => {
    const telefono = "+56987654321";
    expect((await reservar({ telefono })).ok).toBe(true);
    expect((await reservar({ telefono })).ok).toBe(true);
    expect(await reservar({ telefono })).toEqual({ ok: false, error: MENSAJE_PENDIENTES });
  });

  it("las pendientes vencidas y las confirmadas no cuentan", async () => {
    const email = `vencidas-${sufijo}@example.com`;
    const a = await reservar({ email });
    const b = await reservar({ email });
    if (!a.ok || !b.ok) throw new Error("no se creó");
    await db.reserva.update({ where: { codigo: a.codigo }, data: { expiraEn: new Date(Date.now() - 60_000) } });
    await db.reserva.update({ where: { codigo: b.codigo }, data: { estado: "confirmada", expiraEn: null } });
    expect((await reservar({ email })).ok).toBe(true);
    expect((await db.reserva.findUniqueOrThrow({ where: { codigo: a.codigo } })).estado).toBe("cancelada");
  });

  it("huéspedes distintos no se afectan entre sí", async () => {
    for (let i = 0; i < 4; i++) expect((await reservar()).ok).toBe(true);
  });
});

describe("noches máximas", () => {
  it("rechaza estadías de más de 30 noches y acepta 30", async () => {
    const r = await reservar({}, "cabana", fechas(31));
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/hasta 30 noches/) });
    n += 10;
    expect((await reservar({}, "cabana", fechas(30))).ok).toBe(true);
    n += 10;
  });
});

describe("intentos_publicos", () => {
  it("cuenta por ventana y la limpieza borra solo los antiguos", async () => {
    const clave = `test-${sufijo}-ip`;
    const ahora = new Date();
    expect(await consumirIntento("reservar", clave, 2, 60, ahora)).toBe(true);
    expect(await consumirIntento("reservar", clave, 2, 60, ahora)).toBe(true);
    expect(await consumirIntento("reservar", clave, 2, 60, ahora)).toBe(false);
    // Una hora después, la ventana ya no los incluye.
    expect(await consumirIntento("reservar", clave, 2, 60, new Date(ahora.getTime() + 61 * 60_000))).toBe(true);

    await db.intentoPublico.create({ data: { accion: "reservar", clave: `test-${sufijo}-vieja`, creadoEn: new Date(Date.now() - 49 * 3_600_000) } });
    expect(await limpiarIntentos()).toBeGreaterThanOrEqual(1);
    expect(await db.intentoPublico.count({ where: { clave: `test-${sufijo}-vieja` } })).toBe(0);
    expect(await db.intentoPublico.count({ where: { clave } })).toBe(3);
  });
});

describe("notas: texto libre, nunca se interpreta", () => {
  const conNotas = (notas: string) =>
    crearReservaWeb({
      propiedad: slug,
      cabana: "otra",
      ...fechas(),
      adultos: 2,
      ninos: 0,
      nombre: "Ana Pérez",
      email: `notas-${randomUUID().slice(0, 6)}@example.com`,
      telefono: "+56922222222",
      rut: "12.345.678-5",
      notas,
    });

  it("fuera del modo prueba, [PRUEBA] y [REVISAR PAGO] en las notas no cambian nada", async () => {
    process.env.RESERVAS_MODO_PRUEBA = "false";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "";
    try {
      // Sin cuenta de Mercado Pago fuera del modo prueba no se reserva en línea: se crea a mano, como el panel.
      const r = await db.reserva.create({
        data: {
          codigo: `N${sufijo}`.toUpperCase(),
          cabanaId: cabanaOtra,
          checkIn: new Date("2027-06-01T00:00:00Z"),
          checkOut: new Date("2027-06-03T00:00:00Z"),
          adultos: 2,
          huespedNombre: "Ana Pérez",
          huespedEmail: "ana@example.com",
          huespedTelefono: "+56922222222",
          total: 120_000,
          abono: 60_000,
          estado: "confirmada",
          origen: "web",
          notas: "[PRUEBA] [REVISAR PAGO] somos dos",
        },
      });
      expect(r).toMatchObject({ esPrueba: false, revisarPago: false, notas: "[PRUEBA] [REVISAR PAGO] somos dos" });
      expect((await obtenerReservaPublica(r.codigo))?.prueba).toBe(false);
    } finally {
      process.env.RESERVAS_MODO_PRUEBA = "true";
    }
  });

  it("en modo prueba la marca va en es_prueba y las notas quedan tal cual las escribió el huésped", async () => {
    const r = await conNotas("Llegamos tarde");
    if (!r.ok) throw new Error(r.error);
    const fila = await db.reserva.findUniqueOrThrow({ where: { codigo: r.codigo }, select: { esPrueba: true, notas: true, revisarPago: true } });
    expect(fila).toEqual({ esPrueba: true, notas: "Llegamos tarde", revisarPago: false });
    expect((await obtenerReservaPublica(r.codigo))?.prueba).toBe(true);
  });
});
