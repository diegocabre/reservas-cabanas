// Las consultas públicas (sin sesión, sin RLS: corren como postgres) no devuelven datos de otras
// reservas ni datos personales. Inventario y filtros en docs/consultas-publicas.md. npm run test:db.
// Crea datos propios y los borra al final.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

process.env.RESERVAS_MODO_PRUEBA = "true";
process.env.RESEND_API_KEY = "";

const { db } = await import("@/lib/db");
const { existeReserva, obtenerDatosReserva, obtenerReservaPublica } = await import("@/lib/reservas");
const { obtenerCabanaPublica, obtenerDirectorio, obtenerPropiedadPublica } = await import("@/lib/cabanas");

const sufijo = randomUUID().slice(0, 8);
let propiedadId: string, slug: string;
const A = { codigo: `PA${sufijo}-A`.toUpperCase(), email: `ana-${sufijo}@correo.cl`, telefono: "+56911112222", rut: "11.111.111-1", nombre: "Ana Pérez Soto" };
const B = { codigo: `PA${sufijo}-B`.toUpperCase(), email: `beto-${sufijo}@correo.cl`, telefono: "+56933334444", rut: "22.222.222-2", nombre: "Beto Rojas Díaz" };
const DATOS_PERSONALES = [A.email, A.telefono, A.rut, B.email, B.telefono, B.rut, "Soto", "Rojas", "Beto"];

/** Ningún dato personal de A o B aparece en el resultado (en cualquier campo). */
const sinDatosPersonales = (resultado: unknown, permitidos: string[] = []) => {
  const texto = JSON.stringify(resultado);
  for (const dato of DATOS_PERSONALES.filter((d) => !permitidos.includes(d))) expect(texto).not.toContain(dato);
};

beforeAll(async () => {
  const p = await db.propiedad.create({
    data: { nombre: `Test públicas ${sufijo}`, slug: `test-pub-${sufijo}`, prefijoCodigo: `PB${sufijo}`.toUpperCase(), whatsapp: "+56900000000", email: "dueno@example.com" },
  });
  propiedadId = p.id;
  slug = p.slug;
  const c = await db.cabana.create({
    data: { propiedadId, nombre: "Cabaña", slug: "cabana", capacidad: 4, dormitorios: 2, tarifas: { create: [{ personasDesde: 1, personasHasta: 4, nochesDesde: 1, precioNoche: 60_000 }] } },
  });
  const base = { cabanaId: c.id, adultos: 2, total: 120_000, abono: 60_000, estado: "confirmada" as const, origen: "web" as const };
  for (const [h, desde] of [
    [A, "2027-03-01"],
    [B, "2027-03-05"],
  ] as const) {
    await db.reserva.create({
      data: {
        ...base,
        codigo: h.codigo,
        checkIn: new Date(`${desde}T00:00:00Z`),
        checkOut: new Date(Date.parse(`${desde}T00:00:00Z`) + 2 * 86_400_000),
        huespedNombre: h.nombre,
        huespedEmail: h.email,
        huespedTelefono: h.telefono,
        huespedRut: h.rut,
        notas: `nota privada de ${h.nombre}`,
      },
    });
  }
});

afterAll(async () => {
  await db.reserva.deleteMany({ where: { cabana: { propiedadId } } });
  await db.cabana.deleteMany({ where: { propiedadId } });
  await db.propiedad.deleteMany({ where: { id: propiedadId } });
});

describe("consultas públicas", () => {
  it("/reserva/[codigo]: solo la reserva de ese código, sin email, teléfono, RUT, apellido ni notas", async () => {
    const r = await obtenerReservaPublica(A.codigo);
    expect(r?.codigo).toBe(A.codigo);
    expect(r?.huesped).toBe("Ana P.");
    expect(r?.emailOculto).not.toBe(A.email);
    sinDatosPersonales(r);
    expect(JSON.stringify(r)).not.toContain("nota privada");
    expect(await obtenerReservaPublica(`${A.codigo}X`)).toBeNull();
  });

  it("/mi-reserva: el código de una reserva con el email de otra no la encuentra", async () => {
    expect(await existeReserva(A.codigo, A.email)).toBe(true);
    expect(await existeReserva(A.codigo, B.email)).toBe(false);
    expect(await existeReserva(B.codigo, A.email)).toBe(false);
  });

  it("/reservar: solo las noches ocupadas de las otras reservas, sin quién ni el código", async () => {
    const d = await obtenerDatosReserva(slug, "cabana");
    expect(d?.ocupadas).toEqual(expect.arrayContaining(["2027-03-01", "2027-03-02", "2027-03-05", "2027-03-06"]));
    sinDatosPersonales(d);
    expect(JSON.stringify(d)).not.toContain(A.codigo);
    expect(JSON.stringify(d)).not.toContain(B.codigo);
  });

  it("portada, propiedad y cabaña: sin datos de reservas", async () => {
    for (const r of [await obtenerDirectorio(), await obtenerPropiedadPublica(slug), await obtenerCabanaPublica(slug, "cabana")]) {
      sinDatosPersonales(r);
      expect(JSON.stringify(r)).not.toContain(A.codigo);
    }
  });
});
