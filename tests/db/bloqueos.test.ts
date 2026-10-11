// Bloqueos de fechas contra la base real: superposición con reservas en ambos sentidos, bordes,
// concurrencia, auditoría y aislamiento entre propiedades. npm run test:db.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sumarDias } from "@/lib/bloqueos";
import { db } from "@/lib/db";
import { hoyEnChile } from "@/lib/formato";
import { cargarAdmin, comoAdmin, type AdminSesion } from "@/lib/panel-acceso";
import { crearBloqueo, eliminarBloqueo, listarBloqueos } from "@/lib/panel-bloqueos";
import { crearReservaWeb } from "@/lib/reservas";

const sufijo = randomUUID().slice(0, 8);
const HOY = hoyEnChile();
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Fecha a n días de hoy: dentro de los 12 meses reservables. */
const dia = (n: number) => sumarDias(HOY, n);

let propiedadA: { id: string; slug: string };
let propiedadB: { id: string };
let cabanaA: string;
let cabanaA2: string;
let adminA: AdminSesion;
let adminB: AdminSesion;

async function crearPropiedad(letra: string) {
  const p = await db.propiedad.create({
    data: {
      nombre: `Test bloqueos ${letra} ${sufijo}`,
      slug: `test-blq-${letra.toLowerCase()}-${sufijo}`,
      prefijoCodigo: `B${letra}${sufijo}`.toUpperCase(),
      whatsapp: "+56900000000",
      email: "test@example.com",
      ubicacion: "Test",
      politicaCancelacion: "Test",
      instruccionesLlegada: "Test",
    },
  });
  const cabana = async (slug: string) =>
    (
      await db.cabana.create({
        data: {
          propiedadId: p.id,
          nombre: `Cabaña ${slug}`,
          slug,
          capacidad: 4,
          dormitorios: 2,
          tarifas: { create: [{ personasDesde: 1, personasHasta: 4, nochesDesde: 1, precioNoche: 50_000 }] },
        },
      })
    ).id;
  return { p, cabana };
}

async function reserva(cabanaId: string, desde: string, hasta: string, extra: { estado?: "pendiente_pago" | "confirmada" | "cancelada"; expiraEn?: Date } = {}) {
  return db.reserva.create({
    data: {
      codigo: `TB${sufijo}-${randomUUID().slice(0, 6)}`.toUpperCase(),
      cabanaId,
      checkIn: d(desde),
      checkOut: d(hasta),
      adultos: 2,
      huespedNombre: "Huésped Test",
      huespedEmail: "test@example.com",
      huespedTelefono: "+56911111111",
      total: 100_000,
      abono: 50_000,
      estado: extra.estado ?? "confirmada",
      expiraEn: extra.expiraEn ?? null,
      origen: "manual",
    },
    select: { id: true, codigo: true },
  });
}

/** Reserva web real (misma función que usa el formulario público). */
const reservarWeb = (checkIn: string, checkOut: string, cabana = "uno") =>
  crearReservaWeb({
    propiedad: propiedadA.slug,
    cabana,
    checkIn,
    checkOut,
    adultos: 2,
    ninos: 0,
    nombre: "Huésped Web",
    email: "web@example.com",
    telefono: "+56922222222",
    rut: "11.111.111-1",
    notas: "",
  });

beforeAll(async () => {
  const a = await crearPropiedad("A");
  propiedadA = a.p;
  cabanaA = await a.cabana("uno");
  cabanaA2 = await a.cabana("dos");
  const b = await crearPropiedad("B");
  propiedadB = b.p;
  await b.cabana("uno");
  const usuarioA = randomUUID();
  const usuarioB = randomUUID();
  await db.admin.createMany({
    data: [
      { usuarioId: usuarioA, propiedadId: propiedadA.id, email: `a-${sufijo}@example.com` },
      { usuarioId: usuarioB, propiedadId: propiedadB.id, email: `b-${sufijo}@example.com` },
    ],
  });
  adminA = (await cargarAdmin(usuarioA))!;
  adminB = (await cargarAdmin(usuarioB))!;
});

afterAll(async () => {
  const ids = [propiedadA?.id, propiedadB?.id].filter(Boolean);
  const deSusCabanas = { cabana: { propiedadId: { in: ids } } };
  await db.pago.deleteMany({ where: { reserva: deSusCabanas } });
  await db.reserva.deleteMany({ where: deSusCabanas });
  await db.bloqueo.deleteMany({ where: deSusCabanas });
  await db.auditoria.deleteMany({ where: deSusCabanas });
  await db.admin.deleteMany({ where: { propiedadId: { in: ids } } });
  await db.tarifa.deleteMany({ where: deSusCabanas });
  await db.cabana.deleteMany({ where: { propiedadId: { in: ids } } });
  await db.propiedad.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

const bloquear = (primeraNoche: string, ultimaNoche: string, cabanaId = cabanaA, admin = adminA) =>
  crearBloqueo(admin, { cabanaId, primeraNoche, ultimaNoche, motivo: "airbnb" }, HOY);

describe("bloqueo contra reserva existente", () => {
  it("no se puede bloquear sobre una reserva confirmada, y muestra el conflicto", async () => {
    const r = await reserva(cabanaA, dia(10), dia(13)); // noches 10, 11, 12
    const res = await bloquear(dia(12), dia(14));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("tienen una reserva");
      expect(res.reservas).toEqual([{ codigo: r.codigo, huesped: "Huésped Test", estado: "confirmada", desde: dia(10), hasta: dia(13) }]);
    }
    expect(await db.bloqueo.count({ where: { cabanaId: cabanaA, desde: d(dia(12)) } })).toBe(0);
  });

  it("no se puede bloquear sobre una pendiente de pago vigente, pero sí sobre una vencida o cancelada", async () => {
    await reserva(cabanaA, dia(20), dia(22), { estado: "pendiente_pago", expiraEn: new Date(Date.now() + 20 * 60_000) });
    expect((await bloquear(dia(21), dia(21))).ok).toBe(false);

    await reserva(cabanaA, dia(25), dia(27), { estado: "pendiente_pago", expiraEn: new Date(Date.now() - 60_000) });
    await reserva(cabanaA, dia(25), dia(27), { estado: "cancelada" });
    expect((await bloquear(dia(25), dia(26))).ok).toBe(true);
  });

  it("se puede bloquear justo al lado: hasta la noche antes de la llegada y desde el día de salida", async () => {
    await reserva(cabanaA, dia(30), dia(33));
    expect((await bloquear(dia(28), dia(29))).ok).toBe(true); // se libera el día 30, cuando llega el huésped
    expect((await bloquear(dia(33), dia(34))).ok).toBe(true); // empieza el día que sale el huésped
  });

  it("no se puede bloquear encima de otro bloqueo", async () => {
    expect((await bloquear(dia(40), dia(42))).ok).toBe(true);
    const res = await bloquear(dia(42), dia(44));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Ya hay un bloqueo");
  });

  it("la reserva de otra cabaña de la misma propiedad no choca", async () => {
    await reserva(cabanaA2, dia(50), dia(52));
    expect((await bloquear(dia(50), dia(51))).ok).toBe(true);
  });
});

describe("reserva contra bloqueo existente", () => {
  it("la reserva web no puede tomar noches bloqueadas (lo revisa el servidor)", async () => {
    expect((await bloquear(dia(60), dia(62))).ok).toBe(true);
    expect(await reservarWeb(dia(61), dia(63))).toEqual({ ok: false, error: "Alguien acaba de reservar esas fechas. Por favor elige otras." });
    expect(await reservarWeb(dia(58), dia(61))).toMatchObject({ ok: false });
  });

  it("la reserva web sí puede llegar el día en que se libera el bloqueo, o salir el día que empieza", async () => {
    expect((await bloquear(dia(70), dia(71))).ok).toBe(true); // se libera el día 72
    expect(await reservarWeb(dia(72), dia(74))).toMatchObject({ ok: true });
    expect(await reservarWeb(dia(68), dia(70))).toMatchObject({ ok: true });
  });

  it("al eliminar el bloqueo, las fechas se pueden reservar", async () => {
    const b = await bloquear(dia(80), dia(81));
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect((await reservarWeb(dia(80), dia(82))).ok).toBe(false);
    expect(await eliminarBloqueo(adminA, b.id)).toEqual({ ok: true, id: b.id });
    expect(await reservarWeb(dia(80), dia(82))).toMatchObject({ ok: true });
  });

  it("si un bloqueo y una reserva llegan al mismo tiempo, solo uno pasa", async () => {
    for (let i = 0; i < 3; i++) {
      const n = 90 + i * 5;
      const [b, r] = await Promise.all([bloquear(dia(n), dia(n + 1)), reservarWeb(dia(n), dia(n + 2))]);
      expect([b.ok, r.ok].filter(Boolean)).toHaveLength(1);
    }
  });
});

describe("auditoría y propiedades", () => {
  it("registra quién creó y quién eliminó el bloqueo", async () => {
    const b = await bloquear(dia(120), dia(121));
    if (!b.ok) throw new Error(b.error);
    const listado = await listarBloqueos(adminA, HOY);
    expect(listado.find((x) => x.id === b.id)?.creadoPor?.email).toBe(adminA.email);

    await eliminarBloqueo(adminA, b.id);
    const registros = await db.auditoria.findMany({ where: { bloqueoId: b.id }, orderBy: { createdAt: "asc" } });
    expect(registros.map((x) => [x.accion, x.email, x.cabanaId])).toEqual([
      ["crear_bloqueo", adminA.email, cabanaA],
      ["eliminar_bloqueo", adminA.email, cabanaA],
    ]);
    expect(registros[0].detalle).toContain("Reservada en Airbnb");
  });

  it("el dueño de B no puede bloquear, ver ni eliminar bloqueos de A, ni leer su auditoría", async () => {
    const res = await bloquear(dia(130), dia(131), cabanaA, adminB);
    expect(res).toEqual({ ok: false, error: "No encontramos esa cabaña en tus propiedades." });

    const b = await bloquear(dia(135), dia(136));
    if (!b.ok) throw new Error(b.error);
    expect((await listarBloqueos(adminB, HOY)).some((x) => x.id === b.id)).toBe(false);
    expect(await eliminarBloqueo(adminB, b.id)).toEqual({ ok: false, error: "No encontramos ese bloqueo en tus propiedades." });
    expect(await db.bloqueo.count({ where: { id: b.id } })).toBe(1);
    expect(await comoAdmin(adminB, (tx) => tx.auditoria.findMany({ where: { bloqueoId: b.id } }))).toEqual([]);
  });

  it("valida el rango en el servidor", async () => {
    expect((await bloquear(dia(-1), dia(1))).ok).toBe(false);
    expect((await bloquear(dia(5), dia(3))).ok).toBe(false);
  });
});
