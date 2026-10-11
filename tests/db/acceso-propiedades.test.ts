// Un Admin de la propiedad A no puede leer ni modificar datos de la propiedad B.
// Se prueba en las dos capas: las funciones del panel (filtro en el código) y RLS en Postgres
// (consultas SIN filtro corridas con comoAdmin: solo la base las limita).
//
// Corre contra la base de .env: npm run test:db. Crea datos propios y los borra al final.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cargarAdmin, comoAdmin, deSusPropiedades, idsPropiedades, type AdminSesion } from "@/lib/panel-acceso";
import { anotarReserva, datosResumen, listarReservas, obtenerReserva } from "@/lib/panel-datos";

const sufijo = randomUUID().slice(0, 8);
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const usuarioA = randomUUID(); // admin solo de A
const usuarioAB = randomUUID(); // admin de A y de B
const usuarioSinPropiedades = randomUUID();

let propiedadA: string;
let propiedadB: string;
let cabanaA: string;
let cabanaB: string;
let reservaA: { id: string; codigo: string };
let reservaB: { id: string; codigo: string };
let adminA: AdminSesion;
let adminAB: AdminSesion;

async function crearPropiedad(letra: string) {
  const propiedad = await db.propiedad.create({
    data: {
      nombre: `Test RLS ${letra} ${sufijo}`,
      slug: `test-rls-${letra.toLowerCase()}-${sufijo}`,
      prefijoCodigo: `T${letra}${sufijo}`.toUpperCase(),
      whatsapp: "+56900000000",
      email: "test@example.com",
    },
  });
  const cabana = await db.cabana.create({
    data: { propiedadId: propiedad.id, nombre: `Cabaña ${letra}`, slug: "cabana", capacidad: 4, dormitorios: 2 },
  });
  const reserva = await db.reserva.create({
    data: {
      codigo: `${propiedad.prefijoCodigo}-0001`,
      cabanaId: cabana.id,
      checkIn: d("2031-01-10"),
      checkOut: d("2031-01-12"),
      adultos: 2,
      huespedNombre: `Huésped ${letra}`,
      huespedEmail: `huesped-${letra.toLowerCase()}@example.com`,
      huespedTelefono: "+56911111111",
      total: 100_000,
      abono: 50_000,
      estado: "confirmada",
      origen: "manual",
      notas: `nota original ${letra}`,
    },
    select: { id: true, codigo: true },
  });
  return { propiedadId: propiedad.id, cabanaId: cabana.id, reserva };
}

const reservaNueva = (cabanaId: string) => ({
  codigo: `TEST-${randomUUID().slice(0, 8)}`,
  cabanaId,
  checkIn: d("2031-03-01"),
  checkOut: d("2031-03-03"),
  adultos: 2,
  huespedNombre: "Intruso",
  huespedEmail: "intruso@example.com",
  huespedTelefono: "+56922222222",
  total: 1,
  abono: 1,
});

beforeAll(async () => {
  ({ propiedadId: propiedadA, cabanaId: cabanaA, reserva: reservaA } = await crearPropiedad("A"));
  ({ propiedadId: propiedadB, cabanaId: cabanaB, reserva: reservaB } = await crearPropiedad("B"));
  await db.admin.createMany({
    data: [
      { usuarioId: usuarioA, propiedadId: propiedadA, email: `a-${sufijo}@example.com` },
      { usuarioId: usuarioAB, propiedadId: propiedadA, email: `ab-${sufijo}@example.com` },
      { usuarioId: usuarioAB, propiedadId: propiedadB, email: `ab-${sufijo}@example.com`, rol: "staff" },
    ],
  });
  adminA = (await cargarAdmin(usuarioA))!;
  adminAB = (await cargarAdmin(usuarioAB))!;
});

afterAll(async () => {
  const propiedades = [propiedadA, propiedadB].filter(Boolean);
  const cabanas = { cabana: { propiedadId: { in: propiedades } } };
  await db.pago.deleteMany({ where: { reserva: cabanas } });
  await db.reserva.deleteMany({ where: cabanas });
  await db.bloqueo.deleteMany({ where: cabanas });
  await db.admin.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.cabana.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.propiedad.deleteMany({ where: { id: { in: propiedades } } });
  await db.$disconnect();
});

describe("cargarAdmin", () => {
  it("trae todas las propiedades del usuario, con su rol en cada una", () => {
    expect(adminA.propiedades.map((p) => p.id)).toEqual([propiedadA]);
    expect(adminAB.propiedades.map((p) => [p.id, p.rol]).sort()).toEqual(
      [
        [propiedadA, "dueno"],
        [propiedadB, "staff"],
      ].sort(),
    );
  });

  it("devuelve null si el usuario no administra ninguna propiedad", async () => {
    expect(await cargarAdmin(usuarioSinPropiedades)).toBeNull();
  });

  it("idsPropiedades no deja pedir una propiedad ajena", () => {
    expect(idsPropiedades(adminA, propiedadB)).toEqual([]);
    expect(idsPropiedades(adminAB, propiedadB)).toEqual([propiedadB]);
  });
});

describe("funciones del panel (filtro + RLS)", () => {
  it("el admin de A lista solo reservas de A", async () => {
    const codigos = (await listarReservas(adminA)).map((r) => r.codigo);
    expect(codigos).toContain(reservaA.codigo);
    expect(codigos).not.toContain(reservaB.codigo);
  });

  it("pedir explícitamente la propiedad B no devuelve nada al admin de A", async () => {
    expect(await listarReservas(adminA, propiedadB)).toEqual([]);
  });

  it("el admin de A no puede leer una reserva de B por su código", async () => {
    expect(await obtenerReserva(adminA, reservaB.codigo)).toBeNull();
    expect((await obtenerReserva(adminA, reservaA.codigo))?.codigo).toBe(reservaA.codigo);
  });

  it("el admin de A no puede modificar una reserva de B", async () => {
    expect(await anotarReserva(adminA, reservaB.codigo, "hackeada")).toBe(false);
    const b = await db.reserva.findUniqueOrThrow({ where: { id: reservaB.id }, select: { notas: true } });
    expect(b.notas).toBe("nota original B");
  });

  it("el admin de A sí puede modificar su propia reserva", async () => {
    expect(await anotarReserva(adminA, reservaA.codigo, "nota del dueño")).toBe(true);
    await db.reserva.update({ where: { id: reservaA.id }, data: { notas: "nota original A" } });
  });

  it("un admin de A y B ve las reservas de las dos", async () => {
    const codigos = (await listarReservas(adminAB)).map((r) => r.codigo);
    expect(codigos).toEqual(expect.arrayContaining([reservaA.codigo, reservaB.codigo]));
  });
});

// Aquí las consultas van SIN filtro por propiedad, a propósito: lo único que protege es RLS.
describe("RLS en Postgres (consultas sin filtro)", () => {
  const nuestras = () => ({ id: { in: [reservaA.id, reservaB.id] } });

  it("el admin de A solo ve lo de A en reservas, cabañas y propiedades", async () => {
    const { reservas, cabanas, propiedades } = await comoAdmin(adminA, async (tx) => ({
      reservas: await tx.reserva.findMany({ where: nuestras(), select: { id: true } }),
      cabanas: await tx.cabana.findMany({ where: { id: { in: [cabanaA, cabanaB] } }, select: { id: true } }),
      propiedades: await tx.propiedad.findMany({ where: { id: { in: [propiedadA, propiedadB] } }, select: { id: true } }),
    }));
    expect(reservas).toEqual([{ id: reservaA.id }]);
    expect(cabanas).toEqual([{ id: cabanaA }]);
    expect(propiedades).toEqual([{ id: propiedadA }]);
  });

  it("el admin de A no ve las filas Admin de otros usuarios", async () => {
    const admins = await comoAdmin(adminA, (tx) => tx.admin.findMany({ select: { usuarioId: true } }));
    expect(new Set(admins.map((a) => a.usuarioId))).toEqual(new Set([usuarioA]));
  });

  it("un usuario sin propiedades no ve ninguna reserva", async () => {
    const reservas = await comoAdmin({ usuarioId: usuarioSinPropiedades }, (tx) => tx.reserva.findMany({ where: nuestras() }));
    expect(reservas).toEqual([]);
  });

  it("no puede actualizar ni borrar una reserva de B", async () => {
    const { count } = await comoAdmin(adminA, (tx) =>
      tx.reserva.updateMany({ where: { id: reservaB.id }, data: { estado: "cancelada", notas: "hackeada" } }),
    );
    expect(count).toBe(0);
    await expect(
      comoAdmin(adminA, (tx) => tx.reserva.update({ where: { id: reservaB.id }, data: { notas: "hackeada" } })),
    ).rejects.toThrow();
    const borradas = await comoAdmin(adminA, (tx) => tx.reserva.deleteMany({ where: { id: reservaB.id } }));
    expect(borradas.count).toBe(0);

    const b = await db.reserva.findUniqueOrThrow({ where: { id: reservaB.id }, select: { estado: true, notas: true } });
    expect(b).toEqual({ estado: "confirmada", notas: "nota original B" });
  });

  it("no puede crear una reserva ni un bloqueo en una cabaña de B", async () => {
    await expect(comoAdmin(adminA, (tx) => tx.reserva.create({ data: reservaNueva(cabanaB) }))).rejects.toThrow();
    await expect(
      comoAdmin(adminA, (tx) =>
        tx.bloqueo.create({ data: { cabanaId: cabanaB, desde: d("2031-05-01"), hasta: d("2031-05-02") } }),
      ),
    ).rejects.toThrow();
    expect(await db.bloqueo.count({ where: { cabanaId: cabanaB } })).toBe(0);
  });

  it("no puede registrar un pago en una reserva de B", async () => {
    await expect(
      comoAdmin(adminA, (tx) =>
        tx.pago.create({ data: { reservaId: reservaB.id, proveedor: "transferencia", monto: 50_000, estado: "aprobado" } }),
      ),
    ).rejects.toThrow();
    expect(await db.pago.count({ where: { reservaId: reservaB.id } })).toBe(0);
  });

  it("no puede mover su reserva a una cabaña de B", async () => {
    await expect(
      comoAdmin(adminA, (tx) => tx.reserva.update({ where: { id: reservaA.id }, data: { cabanaId: cabanaB } })),
    ).rejects.toThrow();
    const a = await db.reserva.findUniqueOrThrow({ where: { id: reservaA.id }, select: { cabanaId: true } });
    expect(a.cabanaId).toBe(cabanaA);
  });

  it("sí puede crear y borrar un bloqueo en su propia cabaña (RLS no bloquea todo)", async () => {
    const bloqueo = await comoAdmin(adminA, (tx) =>
      tx.bloqueo.create({ data: { cabanaId: cabanaA, desde: d("2031-05-01"), hasta: d("2031-05-02") }, select: { id: true } }),
    );
    const { count } = await comoAdmin(adminA, (tx) => tx.bloqueo.deleteMany({ where: { id: bloqueo.id } }));
    expect(count).toBe(1);
  });

  it("el filtro del código y RLS coinciden para un admin de A y B", async () => {
    const conFiltro = await comoAdmin(adminAB, (tx) =>
      tx.reserva.findMany({ where: { ...nuestras(), ...deSusPropiedades(adminAB) }, select: { id: true } }),
    );
    const sinFiltro = await comoAdmin(adminAB, (tx) => tx.reserva.findMany({ where: nuestras(), select: { id: true } }));
    expect(new Set(conFiltro.map((r) => r.id))).toEqual(new Set([reservaA.id, reservaB.id]));
    expect(new Set(sinFiltro.map((r) => r.id))).toEqual(new Set([reservaA.id, reservaB.id]));
  });

  it("después de comoAdmin, la conexión vuelve a postgres (set local no se filtra al pool)", async () => {
    await comoAdmin(adminA, (tx) => tx.reserva.findMany({ where: nuestras() }));
    const [{ rol }] = await db.$queryRaw<{ rol: string }[]>`select current_user as rol`;
    expect(rol).toBe("postgres");
    expect(await db.reserva.count({ where: nuestras() })).toBe(2);
  });
});

describe("datosResumen (resumen del día)", () => {
  it("no entrega el resumen de una propiedad ajena", async () => {
    expect(await datosResumen(adminA, propiedadB, "2031-01-10")).toBeNull();
  });

  it("trae solo reservas de la propiedad pedida, con su saldo y teléfono", async () => {
    const datos = await datosResumen(adminAB, propiedadA, "2031-01-10");
    expect(datos?.propiedad.nombre).toBe(`Test RLS A ${sufijo}`);
    expect(datos?.cabanasActivas).toBe(1);
    expect(datos?.reservas.map((r) => r.codigo)).toEqual([reservaA.codigo]);
    expect(datos?.reservas[0]).toMatchObject({ checkIn: "2031-01-10", checkOut: "2031-01-12", pagado: 0, telefono: "+56911111111" });
  });

  it("incluye las reservas con [REVISAR PAGO] aunque estén canceladas y fuera del periodo", async () => {
    const revisar = await db.reserva.create({
      data: { ...reservaNueva(cabanaA), estado: "cancelada", notas: "[REVISAR PAGO] pago 1 aprobado por $1, distinto al abono" },
      select: { codigo: true },
    });
    const datos = await datosResumen(adminA, propiedadA, "2031-01-10");
    expect(datos?.reservas.map((r) => r.codigo)).toEqual(expect.arrayContaining([reservaA.codigo, revisar.codigo]));
  });
});
