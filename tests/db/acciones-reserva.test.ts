// Acciones del dueño contra la base real: transiciones de estado válidas e inválidas, tope del
// saldo, concurrencia, auditoría (append-only) y aislamiento entre propiedades.
// npm run test:db. Crea datos propios y los borra al final.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelarReserva, confirmarReserva, marcarRevisado, registrarPago } from "@/lib/panel-acciones";
import { cargarAdmin, comoAdmin, type AdminSesion } from "@/lib/panel-acceso";

const sufijo = randomUUID().slice(0, 8);
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const HOY = "2026-10-11";

let propiedadA: string;
let propiedadB: string;
let cabanaA: string;
let adminA: AdminSesion;
const usuarioA = randomUUID();
const usuarioB = randomUUID();
let adminB: AdminSesion;

let n = 0;
/** Reserva nueva en una cabaña, en fechas lejanas que no chocan con otras del test. */
async function reserva(
  cabanaId: string,
  extra: { estado?: "pendiente_pago" | "confirmada" | "cancelada" | "completada"; notas?: string; desde?: string; hasta?: string; pagado?: number } = {},
) {
  n++;
  const desde = extra.desde ?? `2032-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 20) + 1).padStart(2, "0")}`;
  const hasta = extra.hasta ?? new Date(d(desde).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const r = await db.reserva.create({
    data: {
      codigo: `T${sufijo}-${n}`.toUpperCase(),
      cabanaId,
      checkIn: d(desde),
      checkOut: d(hasta),
      adultos: 2,
      huespedNombre: "Huésped Test",
      huespedEmail: "test@example.com",
      huespedTelefono: "+56911111111",
      total: 240_000,
      abono: 120_000,
      estado: extra.estado ?? "confirmada",
      origen: "manual",
      notas: extra.notas ?? null,
    },
    select: { id: true, codigo: true },
  });
  if (extra.pagado) {
    await db.pago.create({ data: { reservaId: r.id, proveedor: "mercadopago", monto: extra.pagado, estado: "aprobado", refExterna: `t-${r.codigo}` } });
  }
  return r;
}

const estadoDe = async (id: string) => (await db.reserva.findUniqueOrThrow({ where: { id }, select: { estado: true } })).estado;
const auditoriaDe = (reservaId: string) => db.auditoria.findMany({ where: { reservaId }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  const crear = async (letra: string) => {
    const p = await db.propiedad.create({
      data: {
        nombre: `Test acciones ${letra} ${sufijo}`,
        slug: `test-acc-${letra.toLowerCase()}-${sufijo}`,
        prefijoCodigo: `X${letra}${sufijo}`.toUpperCase(),
        whatsapp: "+56900000000",
        email: "test@example.com",
      },
    });
    const c = await db.cabana.create({ data: { propiedadId: p.id, nombre: `Cabaña ${letra}`, slug: "cabana", capacidad: 4, dormitorios: 2 } });
    return { p: p.id, c: c.id };
  };
  ({ p: propiedadA, c: cabanaA } = await crear("A"));
  ({ p: propiedadB } = await crear("B"));
  await db.admin.createMany({
    data: [
      { usuarioId: usuarioA, propiedadId: propiedadA, email: `dueno-a-${sufijo}@example.com` },
      { usuarioId: usuarioB, propiedadId: propiedadB, email: `dueno-b-${sufijo}@example.com` },
    ],
  });
  adminA = (await cargarAdmin(usuarioA))!;
  adminB = (await cargarAdmin(usuarioB))!;
});

afterAll(async () => {
  const propiedades = [propiedadA, propiedadB].filter(Boolean);
  const deSusCabanas = { cabana: { propiedadId: { in: propiedades } } };
  await db.pago.deleteMany({ where: { reserva: deSusCabanas } });
  await db.reserva.deleteMany({ where: deSusCabanas }); // la auditoría se borra en cascada
  await db.bloqueo.deleteMany({ where: deSusCabanas });
  await db.admin.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.cabana.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.propiedad.deleteMany({ where: { id: { in: propiedades } } });
  await db.$disconnect();
});

describe("confirmar", () => {
  it("confirma una pendiente y deja auditoría con quién y cuándo", async () => {
    const r = await reserva(cabanaA, { estado: "pendiente_pago" });
    const antes = Date.now();
    expect(await confirmarReserva(adminA, r.codigo)).toEqual({ ok: true, estado: "confirmada" });
    expect(await estadoDe(r.id)).toBe("confirmada");

    const [a] = await auditoriaDe(r.id);
    expect(a).toMatchObject({
      accion: "confirmar",
      usuarioId: usuarioA,
      email: adminA.email,
      estadoAntes: "pendiente_pago",
      estadoDespues: "confirmada",
    });
    expect(a.createdAt.getTime()).toBeGreaterThanOrEqual(antes - 5_000);
  });

  it("confirma una cancelada con [REVISAR PAGO] y marca el pago como revisado", async () => {
    const r = await reserva(cabanaA, { estado: "cancelada", notas: "[REVISAR PAGO] pago 77 aprobado después de vencer" });
    expect((await confirmarReserva(adminA, r.codigo)).ok).toBe(true);
    const fila = await db.reserva.findUniqueOrThrow({ where: { id: r.id }, select: { estado: true, notas: true } });
    expect(fila).toEqual({ estado: "confirmada", notas: "[PAGO REVISADO] pago 77 aprobado después de vencer" });
  });

  it("no confirma una ya confirmada ni una completada (sin auditoría)", async () => {
    for (const estado of ["confirmada", "completada"] as const) {
      const r = await reserva(cabanaA, { estado });
      const res = await confirmarReserva(adminA, r.codigo);
      expect(res.ok).toBe(false);
      expect(await estadoDe(r.id)).toBe(estado);
      expect(await auditoriaDe(r.id)).toEqual([]);
    }
  });

  it("no confirma una cancelada si otra reserva tomó sus fechas (la base lo impide)", async () => {
    const vieja = await reserva(cabanaA, { estado: "cancelada", desde: "2033-02-01", hasta: "2033-02-04" });
    await reserva(cabanaA, { estado: "confirmada", desde: "2033-02-03", hasta: "2033-02-05" });
    const res = await confirmarReserva(adminA, vieja.codigo);
    expect(res).toEqual({ ok: false, error: "Esas fechas ya están tomadas por otra reserva. No se puede confirmar." });
    expect(await estadoDe(vieja.id)).toBe("cancelada");
    expect(await auditoriaDe(vieja.id)).toEqual([]); // la transacción completa se deshizo
  });

  it("no confirma si hay un bloqueo dentro de la estadía", async () => {
    const r = await reserva(cabanaA, { estado: "pendiente_pago", desde: "2033-03-01", hasta: "2033-03-04" });
    await db.bloqueo.create({ data: { cabanaId: cabanaA, desde: d("2033-03-03"), hasta: d("2033-03-05"), motivo: "test" } });
    const res = await confirmarReserva(adminA, r.codigo);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("bloqueadas");
    expect(await estadoDe(r.id)).toBe("pendiente_pago");
  });
});

describe("cancelar", () => {
  it("exige motivo", async () => {
    const r = await reserva(cabanaA);
    expect(await cancelarReserva(adminA, r.codigo, "  ")).toEqual({ ok: false, error: "Escribe el motivo de la cancelación." });
    expect(await estadoDe(r.id)).toBe("confirmada");
  });

  it("cancela una confirmada, guarda el motivo y libera las fechas", async () => {
    const r = await reserva(cabanaA, { desde: "2033-04-01", hasta: "2033-04-03" });
    expect(await cancelarReserva(adminA, r.codigo, "El huésped avisó que no viene")).toEqual({ ok: true, estado: "cancelada" });
    const [a] = await auditoriaDe(r.id);
    expect(a).toMatchObject({ accion: "cancelar", estadoAntes: "confirmada", estadoDespues: "cancelada", detalle: "El huésped avisó que no viene" });
    // Las mismas fechas ya se pueden reservar.
    await expect(reserva(cabanaA, { desde: "2033-04-01", hasta: "2033-04-03" })).resolves.toBeTruthy();
  });

  it("cancela una pendiente", async () => {
    const r = await reserva(cabanaA, { estado: "pendiente_pago" });
    expect((await cancelarReserva(adminA, r.codigo, "No pagó y avisó por teléfono")).ok).toBe(true);
  });

  it("no cancela una ya cancelada ni una completada", async () => {
    for (const estado of ["cancelada", "completada"] as const) {
      const r = await reserva(cabanaA, { estado });
      expect((await cancelarReserva(adminA, r.codigo, "Motivo cualquiera")).ok).toBe(false);
      expect(await estadoDe(r.id)).toBe(estado);
    }
  });
});

describe("registrar pago del saldo", () => {
  it("registra el saldo en efectivo y deja la reserva pagada completa", async () => {
    const r = await reserva(cabanaA, { pagado: 120_000 });
    const res = await registrarPago(adminA, r.codigo, { monto: 120_000, medio: "efectivo", fecha: HOY }, HOY);
    expect(res).toEqual({ ok: true, pagado: 240_000, saldo: 0 });
    const pago = await db.pago.findFirstOrThrow({ where: { reservaId: r.id, proveedor: "efectivo" } });
    expect(pago).toMatchObject({ monto: 120_000, estado: "aprobado" });
    const [a] = await auditoriaDe(r.id);
    expect(a).toMatchObject({ accion: "registrar_pago", detalle: "$120.000 en efectivo, pagado el 11 de octubre de 2026" });
  });

  it("impide que abono + saldo supere el total", async () => {
    const r = await reserva(cabanaA, { pagado: 120_000 });
    const res = await registrarPago(adminA, r.codigo, { monto: 120_001, medio: "transferencia", fecha: HOY }, HOY);
    expect(res.ok).toBe(false);
    expect(await db.pago.count({ where: { reservaId: r.id } })).toBe(1);
  });

  it("con dos registros simultáneos del saldo completo, solo uno pasa", async () => {
    const r = await reserva(cabanaA, { pagado: 120_000 });
    const pago = { monto: 120_000, medio: "efectivo" as const, fecha: HOY };
    const resultados = await Promise.all([registrarPago(adminA, r.codigo, pago, HOY), registrarPago(adminA, r.codigo, pago, HOY)]);
    expect(resultados.filter((x) => x.ok)).toHaveLength(1);
    const { _sum } = await db.pago.aggregate({ where: { reservaId: r.id, estado: "aprobado" }, _sum: { monto: true } });
    expect(_sum.monto).toBe(240_000);
  });

  it("no registra pagos en una cancelada", async () => {
    const r = await reserva(cabanaA, { estado: "cancelada" });
    expect((await registrarPago(adminA, r.codigo, { monto: 1_000, medio: "efectivo", fecha: HOY }, HOY)).ok).toBe(false);
  });
});

describe("marcar pago revisado", () => {
  it("quita el aviso sin cambiar el estado y lo audita", async () => {
    const r = await reserva(cabanaA, { estado: "cancelada", notas: "[REVISAR PAGO] pago 5 aprobado después de vencer: reembolsar" });
    expect(await marcarRevisado(adminA, r.codigo, "Devuelto por Mercado Pago")).toEqual({ ok: true, estado: "cancelada" });
    const [a] = await auditoriaDe(r.id);
    expect(a).toMatchObject({ accion: "marcar_revisado", estadoAntes: "cancelada", estadoDespues: "cancelada", detalle: "Devuelto por Mercado Pago" });
    expect((await marcarRevisado(adminA, r.codigo, "")).ok).toBe(false);
  });
});

describe("aislamiento entre propiedades", () => {
  it("el dueño de B no puede confirmar, cancelar ni registrar pagos en reservas de A", async () => {
    const pendiente = await reserva(cabanaA, { estado: "pendiente_pago" });
    const confirmada = await reserva(cabanaA, { pagado: 120_000 });
    const noEncontrada = { ok: false, error: "No encontramos esa reserva en tus propiedades." };
    expect(await confirmarReserva(adminB, pendiente.codigo)).toEqual(noEncontrada);
    expect(await cancelarReserva(adminB, confirmada.codigo, "Intento ajeno")).toEqual(noEncontrada);
    expect(await registrarPago(adminB, confirmada.codigo, { monto: 1_000, medio: "efectivo", fecha: HOY }, HOY)).toEqual(noEncontrada);
    expect(await estadoDe(pendiente.id)).toBe("pendiente_pago");
    expect(await estadoDe(confirmada.id)).toBe("confirmada");
    expect(await db.pago.count({ where: { reservaId: confirmada.id } })).toBe(1);
  });
});

describe("auditoría append-only (RLS)", () => {
  it("el panel no puede editar ni borrar la auditoría, ni escribirla a nombre de otro", async () => {
    const r = await reserva(cabanaA, { estado: "pendiente_pago" });
    await confirmarReserva(adminA, r.codigo);
    const [a] = await auditoriaDe(r.id);

    await expect(comoAdmin(adminA, (tx) => tx.auditoria.update({ where: { id: a.id }, data: { email: "otro@x.cl" } }))).rejects.toThrow();
    await expect(comoAdmin(adminA, (tx) => tx.auditoria.deleteMany({ where: { id: a.id } }))).rejects.toThrow();
    await expect(
      comoAdmin(adminA, (tx) =>
        tx.auditoria.create({
          data: { reservaId: r.id, usuarioId: usuarioB, email: "falso@x.cl", accion: "cancelar", estadoAntes: "confirmada", estadoDespues: "cancelada" },
        }),
      ),
    ).rejects.toThrow();
    expect(await auditoriaDe(r.id)).toHaveLength(1);
  });

  it("el dueño de B no ve la auditoría de A", async () => {
    const r = await reserva(cabanaA, { estado: "pendiente_pago" });
    await confirmarReserva(adminA, r.codigo);
    const vistas = await comoAdmin(adminB, (tx) => tx.auditoria.findMany({ where: { reservaId: r.id } }));
    expect(vistas).toEqual([]);
  });
});

