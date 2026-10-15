// Aprobación manual de reservas contra la base real: flujo completo, rechazo, expiraciones,
// concurrencia, doble clic e aislamiento entre propiedades. Mercado Pago va simulado (sin red ni
// cobros); los correos no se envían (sin RESEND_API_KEY quedan registrados como aviso fallido).
// npm run test:db. Crea datos propios y los borra al final.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mp = vi.hoisted(() => ({
  preferencias: [] as { external_reference: string; expiration_date_to: string; unit_price: number }[],
  pagos: new Map<string, Record<string, unknown>>(),
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    async create({ body }: { body: { external_reference: string; expiration_date_to: string; items: { unit_price: number }[] } }) {
      mp.preferencias.push({ external_reference: body.external_reference, expiration_date_to: body.expiration_date_to, unit_price: body.items[0].unit_price });
      // Un poco de demora, como la API real: el doble clic se cruza con la primera aprobación.
      await new Promise((r) => setTimeout(r, 300));
      return { init_point: `https://mp.test/pagar/${body.external_reference}/${mp.preferencias.length}` };
    }
  },
  Payment: class {
    async get({ id }: { id: string }) {
      return mp.pagos.get(String(id));
    }
  },
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

process.env.RESERVAS_MODO_PRUEBA = "true";
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-simulado";
process.env.RESEND_API_KEY = "";

const { db } = await import("@/lib/db");
const { crearReservaWeb, obtenerDatosReserva } = await import("@/lib/reservas");
const { aprobarSolicitud, avisarSolicitudNueva, configurarAprobacion, procesarSolicitudes, rechazarSolicitud, registrarWhatsappAbierto, renovarLinkPago } =
  await import("@/lib/aprobacion");
const { registrarPagoMercadoPago } = await import("@/lib/mercadopago");
const { cancelarReserva } = await import("@/lib/panel-acciones");
const { cargarAdmin, comoAdmin } = await import("@/lib/panel-acceso");
type AdminSesion = NonNullable<Awaited<ReturnType<typeof cargarAdmin>>>;

const sufijo = randomUUID().slice(0, 8);
const HORA = 3_600_000;
let propiedadA: string, propiedadB: string, cabanaA: string, cabanaB: string;
let slugA: string;
let adminA: AdminSesion, adminB: AdminSesion, staffA: AdminSesion;

let n = 0;
/** Fechas propias para cada caso (2027, dentro de los 12 meses reservables). */
function fechas() {
  n++;
  const mes = String((n % 9) + 1).padStart(2, "0");
  const dia = String(((n * 3) % 24) + 1).padStart(2, "0");
  const checkIn = `2027-${mes}-${dia}`;
  const checkOut = new Date(Date.parse(`${checkIn}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
  return { checkIn, checkOut };
}

const datosHuesped = (f: { checkIn: string; checkOut: string }, nombre = "Ana Pérez") => ({
  propiedad: slugA,
  cabana: "cabana",
  ...f,
  adultos: 2,
  ninos: 0,
  nombre,
  email: "ana@example.com",
  telefono: "+56912345678",
  rut: "12.345.678-5",
  notas: "Somos dos, venimos de Santiago",
});

const leer = (codigo: string) => db.reserva.findUniqueOrThrow({ where: { codigo } });
const conAprobacion = (activa: boolean) =>
  db.cabana.update({ where: { id: cabanaA }, data: { requiereAprobacion: activa, horasRespuestaAprobacion: 24, horasParaPagar: 24 } });

async function solicitud(f = fechas()) {
  const r = await crearReservaWeb(datosHuesped(f));
  if (!r.ok) throw new Error(r.error);
  return r.codigo;
}

beforeAll(async () => {
  const crear = async (letra: string) => {
    const p = await db.propiedad.create({
      data: {
        nombre: `Test solicitudes ${letra} ${sufijo}`,
        slug: `test-sol-${letra.toLowerCase()}-${sufijo}`,
        prefijoCodigo: `S${letra}${sufijo}`.toUpperCase(),
        whatsapp: "+56900000000",
        email: "dueno@example.com",
      },
    });
    const c = await db.cabana.create({
      data: {
        propiedadId: p.id,
        nombre: `Cabaña ${letra}`,
        slug: "cabana",
        capacidad: 4,
        dormitorios: 2,
        tarifas: { create: [{ personasDesde: 1, personasHasta: 4, nochesDesde: 1, precioNoche: 60_000 }] },
      },
    });
    return { p, c: c.id };
  };
  const a = await crear("A");
  const b = await crear("B");
  propiedadA = a.p.id;
  slugA = a.p.slug;
  cabanaA = a.c;
  propiedadB = b.p.id;
  cabanaB = b.c;

  const [uA, uB, uS] = [randomUUID(), randomUUID(), randomUUID()];
  await db.admin.createMany({
    data: [
      { usuarioId: uA, propiedadId: propiedadA, email: `dueno-a-${sufijo}@example.com`, rol: "dueno" },
      { usuarioId: uB, propiedadId: propiedadB, email: `dueno-b-${sufijo}@example.com`, rol: "dueno" },
      { usuarioId: uS, propiedadId: propiedadA, email: `staff-a-${sufijo}@example.com`, rol: "staff" },
    ],
  });
  adminA = (await cargarAdmin(uA))!;
  adminB = (await cargarAdmin(uB))!;
  staffA = (await cargarAdmin(uS))!;
});

beforeEach(async () => {
  mp.preferencias.length = 0;
  await conAprobacion(true);
});

afterAll(async () => {
  const propiedades = [propiedadA, propiedadB].filter(Boolean);
  const deSusCabanas = { cabana: { propiedadId: { in: propiedades } } };
  await db.pago.deleteMany({ where: { reserva: deSusCabanas } });
  await db.reserva.deleteMany({ where: deSusCabanas });
  await db.auditoria.deleteMany({ where: { cabanaId: { in: [cabanaA, cabanaB].filter(Boolean) } } });
  await db.admin.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.cabana.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.propiedad.deleteMany({ where: { id: { in: propiedades } } });
  await db.$disconnect();
});

describe("interruptor apagado", () => {
  it("el flujo actual no cambia: pendiente_pago con 30 minutos para pagar, sin link guardado", async () => {
    await conAprobacion(false);
    const antes = Date.now();
    const r = await crearReservaWeb(datosHuesped(fechas()));
    expect(r.ok && r.estado).toBe("pendiente_pago");
    if (!r.ok) return;
    const fila = await leer(r.codigo);
    expect(fila.estado).toBe("pendiente_pago");
    expect(fila.expiraEn!.getTime() - antes).toBeGreaterThan(29 * 60_000);
    expect(fila.expiraEn!.getTime() - antes).toBeLessThan(31 * 60_000);
    expect([fila.aprobadaEn, fila.linkPago, fila.linkPagoExpiraEn]).toEqual([null, null, null]);

    // Y la expiración sigue igual: una pendiente_pago vencida pasa a cancelada, no a expirada.
    await procesarSolicitudes(new Date(Date.now() + HORA));
    expect((await leer(r.codigo)).estado).toBe("cancelada");
  });

  it("la configuración del formulario sale de la cabaña", async () => {
    await conAprobacion(false);
    expect((await obtenerDatosReserva(slugA, "cabana"))?.requiereAprobacion).toBe(false);
    await conAprobacion(true);
    expect((await obtenerDatosReserva(slugA, "cabana"))?.requiereAprobacion).toBe(true);
  });
});

describe("solicitud → aprobar → pagar → confirmada", () => {
  it("recorre el flujo completo", async () => {
    const f = fechas();
    const antes = Date.now();
    const codigo = await solicitud(f);

    let fila = await leer(codigo);
    expect(fila.estado).toBe("pendiente_aprobacion");
    expect(fila.expiraEn!.getTime() - antes).toBeGreaterThan(23.9 * HORA); // horas_respuesta_aprobacion = 24
    expect(mp.preferencias).toHaveLength(0); // no se cobra al pedir
    // Las fechas quedan retenidas para otros huéspedes.
    const otro = await crearReservaWeb(datosHuesped(f, "Otro Huésped"));
    expect(otro.ok).toBe(false);
    // Avisos: sin RESEND_API_KEY no salen y quedan registrados para mostrarlos en el panel.
    await avisarSolicitudNueva(codigo);
    expect((await leer(codigo)).avisoFallido).toMatch(/RESEND_API_KEY/);

    const ap = await aprobarSolicitud(adminA, codigo);
    expect(ap).toEqual({ ok: true, estado: "aprobada_pendiente_pago", nuevo: true });
    fila = await leer(codigo);
    expect(fila.estado).toBe("aprobada_pendiente_pago");
    expect(fila.aprobadaEn).not.toBeNull();
    expect(fila.linkPago).toMatch(/^https:\/\/mp\.test\/pagar\//);
    expect(fila.linkPagoExpiraEn!.getTime()).toBe(fila.expiraEn!.getTime());
    expect(fila.linkPagoExpiraEn!.getTime() - fila.aprobadaEn!.getTime()).toBe(24 * HORA); // horas_para_pagar
    expect(mp.preferencias).toEqual([
      { external_reference: codigo, expiration_date_to: fila.linkPagoExpiraEn!.toISOString(), unit_price: fila.abono },
    ]);

    expect(await registrarWhatsappAbierto(adminA, codigo)).toBe(true);
    expect((await leer(codigo)).whatsappAbiertoEn).not.toBeNull();

    // El webhook existente confirma una aprobada_pendiente_pago.
    const idPago = `pago-${codigo}`;
    mp.pagos.set(idPago, {
      id: idPago,
      status: "approved",
      external_reference: codigo,
      transaction_amount: fila.abono,
      currency_id: "CLP",
      date_approved: new Date().toISOString(),
    });
    expect(await registrarPagoMercadoPago(idPago)).toBe("confirmada");
    expect((await leer(codigo)).estado).toBe("confirmada");
    expect(await registrarPagoMercadoPago(idPago)).toBe("ya_registrado");
  });
});

describe("doble clic en Aprobar", () => {
  it("dos aprobaciones simultáneas crean UN link y solo una avisa (nuevo: true)", async () => {
    const codigo = await solicitud();
    const resultados = await Promise.all([aprobarSolicitud(adminA, codigo), aprobarSolicitud(adminA, codigo)]);
    expect(resultados.map((r) => r.ok && r.nuevo).sort()).toEqual([false, true]);
    expect(mp.preferencias).toHaveLength(1);
    const auditoria = await db.auditoria.count({ where: { reserva: { codigo }, accion: "aprobar" } });
    expect(auditoria).toBe(1);

    // Un tercer clic más tarde tampoco cambia el link.
    const link = (await leer(codigo)).linkPago;
    expect(await aprobarSolicitud(adminA, codigo)).toEqual({ ok: true, estado: "aprobada_pendiente_pago", nuevo: false });
    expect((await leer(codigo)).linkPago).toBe(link);
  });
});

describe("rechazar", () => {
  it("libera las fechas y deja el motivo en la auditoría", async () => {
    const f = fechas();
    const codigo = await solicitud(f);
    const r = await rechazarSolicitud(adminA, codigo, "  Ya tenía esas fechas comprometidas  ");
    expect(r).toEqual({ ok: true, estado: "rechazada", nuevo: true, motivo: "Ya tenía esas fechas comprometidas" });
    expect((await leer(codigo)).estado).toBe("rechazada");
    expect(await rechazarSolicitud(adminA, codigo)).toMatchObject({ ok: true, nuevo: false });
    const a = await db.auditoria.findFirstOrThrow({ where: { reserva: { codigo }, accion: "rechazar" } });
    expect(a.detalle).toBe("Ya tenía esas fechas comprometidas");

    // Las fechas quedaron libres: otro huésped puede pedirlas.
    const otra = await crearReservaWeb(datosHuesped(f, "Otro Huésped"));
    expect(otra.ok).toBe(true);
    // Y un rechazo no se puede aprobar.
    expect((await aprobarSolicitud(adminA, codigo)).ok).toBe(false);
  });

  it("una aprobada no se rechaza: se cancela, y libera las fechas", async () => {
    const codigo = await solicitud();
    await aprobarSolicitud(adminA, codigo);
    expect((await rechazarSolicitud(adminA, codigo)).ok).toBe(false);
    expect((await cancelarReserva(adminA, codigo, "El huésped avisó que no viene")).ok).toBe(true);
    expect((await leer(codigo)).estado).toBe("cancelada");
  });
});

describe("expiraciones (cron)", () => {
  it("el dueño no responde a tiempo: expirada, fechas libres, un solo aviso", async () => {
    const f = fechas();
    const codigo = await solicitud(f);
    const despues = new Date(Date.now() + 25 * HORA);

    await procesarSolicitudes(despues);
    const fila = await leer(codigo);
    expect(fila.estado).toBe("expirada");
    expect(fila.expiracionAvisadaEn).not.toBeNull();
    // Idempotente: otra corrida no vuelve a avisar.
    const marca = fila.expiracionAvisadaEn!.getTime();
    await procesarSolicitudes(new Date(despues.getTime() + HORA));
    expect((await leer(codigo)).expiracionAvisadaEn!.getTime()).toBe(marca);
    // Ya no se puede aprobar.
    expect((await aprobarSolicitud(adminA, codigo)).ok).toBe(false);
    // Fechas libres.
    expect((await crearReservaWeb(datosHuesped(f, "Otro Huésped"))).ok).toBe(true);
  });

  it("recordatorio al dueño una sola vez en las últimas 6 horas", async () => {
    const codigo = await solicitud();
    await procesarSolicitudes(new Date(Date.now() + 10 * HORA));
    expect((await leer(codigo)).recordatorioDuenoEn).toBeNull();
    const r1 = await procesarSolicitudes(new Date(Date.now() + 20 * HORA));
    expect(r1.recordatoriosDueno).toBeGreaterThanOrEqual(1);
    const marca = (await leer(codigo)).recordatorioDuenoEn;
    expect(marca).not.toBeNull();
    await procesarSolicitudes(new Date(Date.now() + 21 * HORA));
    expect((await leer(codigo)).recordatorioDuenoEn).toEqual(marca);
  });

  it("el huésped no paga a tiempo: recordatorio, luego expirada; el dueño puede renovar el link", async () => {
    const f = fechas();
    const codigo = await solicitud(f);
    await aprobarSolicitud(adminA, codigo);

    await procesarSolicitudes(new Date(Date.now() + 19 * HORA));
    expect((await leer(codigo)).recordatorioHuespedEn).not.toBeNull();

    await procesarSolicitudes(new Date(Date.now() + 25 * HORA));
    let fila = await leer(codigo);
    expect(fila.estado).toBe("expirada");
    expect(fila.expiracionAvisadaEn).not.toBeNull();

    // Generar nuevo link: vuelve a retener las fechas con otro link.
    const anterior = fila.linkPago;
    expect((await renovarLinkPago(adminA, codigo)).ok).toBe(true);
    fila = await leer(codigo);
    expect(fila.estado).toBe("aprobada_pendiente_pago");
    expect(fila.linkPago).not.toBe(anterior);
    expect([fila.expiracionAvisadaEn, fila.recordatorioHuespedEn]).toEqual([null, null]);
    expect((await crearReservaWeb(datosHuesped(f, "Otro Huésped"))).ok).toBe(false);
  });

  it("no se renueva un link vigente", async () => {
    const codigo = await solicitud();
    await aprobarSolicitud(adminA, codigo);
    const r = await renovarLinkPago(adminA, codigo);
    expect(r.ok).toBe(false);
  });
});

describe("concurrencia", () => {
  it("dos huéspedes piden las mismas fechas a la vez: solo uno queda con la solicitud", async () => {
    const f = fechas();
    const resultados = await Promise.all([
      crearReservaWeb(datosHuesped(f, "Huésped Uno")),
      crearReservaWeb(datosHuesped(f, "Huésped Dos")),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const fallida = resultados.find((r) => !r.ok);
    expect(fallida && !fallida.ok && fallida.error).toMatch(/elige otras/);
  });

  it("la base impide dos solicitudes activas traslapadas aunque el código no lo revise", async () => {
    const f = fechas();
    const codigo = await solicitud(f);
    const fila = await leer(codigo);
    await expect(
      db.reserva.create({
        data: {
          codigo: `X${sufijo}-${n}`,
          cabanaId: cabanaA,
          checkIn: fila.checkIn,
          checkOut: fila.checkOut,
          adultos: 1,
          huespedNombre: "Directo",
          huespedEmail: "x@example.com",
          huespedTelefono: "+56911111111",
          total: 1,
          abono: 1,
          estado: "aprobada_pendiente_pago",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("permisos", () => {
  it("un dueño no aprueba ni rechaza solicitudes de otra propiedad", async () => {
    const codigo = await solicitud();
    expect(await aprobarSolicitud(adminB, codigo)).toEqual({ ok: false, error: "No encontramos esa reserva en tus propiedades." });
    expect((await rechazarSolicitud(adminB, codigo)).ok).toBe(false);
    expect(await registrarWhatsappAbierto(adminB, codigo)).toBe(false);
    expect((await leer(codigo)).estado).toBe("pendiente_aprobacion");
    expect(mp.preferencias).toHaveLength(0);
  });

  it("solo el dueño cambia el interruptor, y solo en sus cabañas", async () => {
    const cfg = { requiereAprobacion: false, horasRespuestaAprobacion: 12, horasParaPagar: 6 };
    expect((await configurarAprobacion(adminB, cabanaA, cfg)).ok).toBe(false);
    expect((await configurarAprobacion(staffA, cabanaA, cfg)).ok).toBe(false);
    expect((await configurarAprobacion(adminA, cabanaA, { ...cfg, horasParaPagar: 0 })).ok).toBe(false);
    expect(await db.cabana.findUniqueOrThrow({ where: { id: cabanaA } })).toMatchObject({ requiereAprobacion: true, horasParaPagar: 24 });

    expect((await configurarAprobacion(adminA, cabanaA, cfg)).ok).toBe(true);
    expect(await db.cabana.findUniqueOrThrow({ where: { id: cabanaA } })).toMatchObject({
      requiereAprobacion: false,
      horasRespuestaAprobacion: 12,
      horasParaPagar: 6,
    });
    const a = await db.auditoria.findFirstOrThrow({ where: { cabanaId: cabanaA, accion: "configurar_cabana" } });
    expect(a.detalle).toBe("Aprobación manual desactivada");
  });

  it("RLS: aunque el código se salte el filtro, panel_admin no cambia cabañas ajenas ni otras columnas", async () => {
    const ajena = await comoAdmin(adminA, (tx) => tx.$executeRaw`update cabana set requiere_aprobacion = true where id = ${cabanaB}::uuid`);
    expect(ajena).toBe(0);
    const comoStaff = await comoAdmin(staffA, (tx) => tx.$executeRaw`update cabana set requiere_aprobacion = true where id = ${cabanaA}::uuid`);
    expect(comoStaff).toBe(0);
    await expect(comoAdmin(adminA, (tx) => tx.$executeRaw`update cabana set capacidad = 99 where id = ${cabanaA}::uuid`)).rejects.toThrow();
  });

  it("apagar el interruptor no toca las solicitudes ya creadas", async () => {
    const codigo = await solicitud();
    await configurarAprobacion(adminA, cabanaA, { requiereAprobacion: false, horasRespuestaAprobacion: 24, horasParaPagar: 24 });
    expect((await leer(codigo)).estado).toBe("pendiente_aprobacion");
    expect((await aprobarSolicitud(adminA, codigo)).ok).toBe(true);
    // Las reservas nuevas ya siguen el flujo normal.
    const nueva = await crearReservaWeb(datosHuesped(fechas()));
    expect(nueva.ok && nueva.estado).toBe("pendiente_pago");
  });
});
