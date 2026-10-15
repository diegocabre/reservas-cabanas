// Plataforma contra la base: suspender una propiedad la saca del sitio, de las reservas y del panel;
// reactivarla la devuelve igual. Reseñas por propiedad. npm run test:db. Crea y borra sus datos.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
process.env.RESERVAS_MODO_PRUEBA = "true";
process.env.RESEND_API_KEY = "";

const { db } = await import("@/lib/db");
const { obtenerCabanaPublica, obtenerDirectorio, obtenerPropiedadPublica } = await import("@/lib/cabanas");
const { crearReservaWeb, obtenerDatosReserva } = await import("@/lib/reservas");
const { cargarAdmin, tienePropiedadSuspendida } = await import("@/lib/panel-acceso");
const { cambiarSuspension, elegirResenas, listarPropiedades } = await import("@/lib/plataforma");

const sufijo = randomUUID().slice(0, 8);
const slug = `test-plat-${sufijo}`;
const usuario = randomUUID();
const sa = { usuarioId: randomUUID(), email: `sa-${sufijo}@example.com` };
let propiedadId = "";

const reservar = () =>
  crearReservaWeb({
    propiedad: slug,
    cabana: "cabana",
    checkIn: "2027-03-10",
    checkOut: "2027-03-12",
    adultos: 2,
    ninos: 0,
    nombre: "Ana Pérez",
    email: "ana@example.com",
    telefono: "+56912345678",
    rut: "12.345.678-5",
    notas: "",
  });

beforeAll(async () => {
  const p = await db.propiedad.create({
    data: {
      nombre: `Test plataforma ${sufijo}`,
      slug,
      prefijoCodigo: `PL${sufijo}`.toUpperCase(),
      whatsapp: "+56900000000",
      email: "dueno@example.com",
      cabanas: {
        create: {
          nombre: "Cabaña",
          slug: "cabana",
          capacidad: 4,
          dormitorios: 2,
          tarifas: { create: [{ personasDesde: 1, personasHasta: 4, nochesDesde: 1, precioNoche: 60_000 }] },
        },
      },
    },
  });
  propiedadId = p.id;
  await db.admin.create({ data: { usuarioId: usuario, propiedadId, email: `dueno-${sufijo}@example.com`, rol: "dueno" } });
});

afterAll(async () => {
  await db.reserva.deleteMany({ where: { cabana: { propiedadId } } });
  await db.admin.deleteMany({ where: { propiedadId } });
  await db.cabana.deleteMany({ where: { propiedadId } });
  await db.propiedad.deleteMany({ where: { id: propiedadId } });
  await db.$disconnect();
});

describe("suspender una propiedad", () => {
  it("desaparece del sitio, no recibe reservas y sus admins no entran; reactivar la devuelve", async () => {
    expect(await obtenerCabanaPublica(slug, "cabana")).not.toBeNull();
    expect((await cargarAdmin(usuario))?.propiedades[0]).toMatchObject({ id: propiedadId, resenas: "apagadas" });

    expect(await cambiarSuspension(sa, propiedadId, true)).toEqual({ ok: true });
    expect(await cambiarSuspension(sa, propiedadId, true)).toMatchObject({ ok: false });
    expect(await db.propiedad.findUniqueOrThrow({ where: { id: propiedadId } })).toMatchObject({ suspendida: true, suspendidaPor: sa.email });

    expect(await obtenerCabanaPublica(slug, "cabana")).toBeNull();
    expect(await obtenerPropiedadPublica(slug)).toBeNull();
    expect((await obtenerDirectorio()).some((x) => x.slug === slug)).toBe(false);
    expect(await obtenerDatosReserva(slug, "cabana")).toBeNull();
    expect((await reservar()).ok).toBe(false);
    expect(await cargarAdmin(usuario)).toBeNull();
    expect(await tienePropiedadSuspendida(usuario)).toBe(true);
    expect((await listarPropiedades("2027-01-01")).find((x) => x.id === propiedadId)?.suspendida).toBe(true);

    expect(await cambiarSuspension(sa, propiedadId, false)).toEqual({ ok: true });
    expect(await obtenerCabanaPublica(slug, "cabana")).not.toBeNull();
    expect(await cargarAdmin(usuario)).not.toBeNull();
    expect(await tienePropiedadSuspendida(usuario)).toBe(false);
    const r = await reservar();
    expect(r.ok).toBe(true);
    expect((await listarPropiedades("2027-01-01")).find((x) => x.id === propiedadId)?.reservasVigentes).toBe(1);
  });
});

describe("reseñas por propiedad", () => {
  it("valida la etapa y exige RESENAS_SECRETO para activarlas", async () => {
    expect(await elegirResenas(propiedadId, "todas")).toMatchObject({ ok: false });
    const secreto = process.env.RESENAS_SECRETO;
    delete process.env.RESENAS_SECRETO;
    try {
      expect(await elegirResenas(propiedadId, "cabana")).toMatchObject({ ok: false, error: expect.stringMatching(/RESENAS_SECRETO/) });
    } finally {
      process.env.RESENAS_SECRETO = secreto;
    }
    process.env.RESENAS_SECRETO = "secreto-de-prueba-para-resenas-0123456789";
    expect(await elegirResenas(propiedadId, "completas")).toEqual({ ok: true });
    expect((await cargarAdmin(usuario))?.propiedades[0].resenas).toBe("completas");
    expect(await elegirResenas(propiedadId, "apagadas")).toEqual({ ok: true });
  });
});
