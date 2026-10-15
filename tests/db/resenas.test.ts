// Reseñas contra la base: elegibilidad, token de un solo uso, doble ciego, RLS entre dueños,
// moderación, página pública, historial del huésped, derechos del huésped y crons idempotentes.
// Los correos no se envían (sin RESEND_API_KEY quedan como aviso fallido). npm run test:db.
// Crea datos propios y los borra al final.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.RESENAS_SECRETO = "secreto-de-prueba-para-resenas-0123456789";
process.env.RESEND_API_KEY = "";

const { db } = await import("@/lib/db");
const { cargarAdmin, comoAdmin } = await import("@/lib/panel-acceso");
const r = await import("@/lib/resenas");
const { firmarToken, jsonLdCabana } = await import("@/lib/resenas-reglas");
type AdminSesion = NonNullable<Awaited<ReturnType<typeof cargarAdmin>>>;

const SECRETO = process.env.RESENAS_SECRETO!;
const DIA = 86_400_000;
const sufijo = randomUUID().slice(0, 8);
let propiedadA: string, propiedadB: string, cabanaA: string, cabanaB: string;
let adminA: AdminSesion, adminB: AdminSesion;
const superadmin = { usuarioId: randomUUID(), email: `sa-${sufijo}@example.com` };

const notas = { limpieza: 5, ubicacion: 4, comunicacion: 5, veracidad: 4, calidadPrecio: 4 };
const comentario = "Muy linda la cabaña, la vista al mar increíble.";

let n = 0;
/** Reserva con su propio rango de fechas (1 noche) en la cabaña. */
async function reserva(opciones: { cabana?: string; estado?: "confirmada" | "pendiente_pago" | "cancelada"; email?: string; telefono?: string } = {}) {
  n++;
  const checkIn = new Date(Date.UTC(2026, 0, 1) + n * 3 * DIA);
  const checkOut = new Date(checkIn.getTime() + DIA);
  const fila = await db.reserva.create({
    data: {
      codigo: `RS${sufijo}${n}`.toUpperCase(),
      cabanaId: opciones.cabana ?? cabanaA,
      checkIn,
      checkOut,
      adultos: 2,
      huespedNombre: "Ana María Pérez Soto",
      huespedEmail: opciones.email ?? `ana-${sufijo}@example.com`,
      huespedTelefono: opciones.telefono ?? "+56912345678",
      total: 60_000,
      abono: 30_000,
      estado: opciones.estado ?? "confirmada",
    },
  });
  const co = checkOut.toISOString().slice(0, 10);
  /** Instante (15:00 UTC) a `dias` días del check-out. */
  const dia = (dias: number) => new Date(`${co}T15:00:00Z`).getTime() + dias * DIA;
  return { ...fila, en: (dias: number) => new Date(dia(dias)) };
}

/** Token vigente de la invitación (el servidor lo arma con el secreto; aquí igual). */
async function tokenDe(reservaId: string) {
  const c = await db.cicloResena.findUniqueOrThrow({ where: { reservaId } });
  return firmarToken(SECRETO, "resena", c.id, c.tokenVersion);
}

async function invitar(res: Awaited<ReturnType<typeof reserva>>) {
  await r.asegurarCiclo(db, res.id, res.checkOut.toISOString().slice(0, 10));
  return tokenDe(res.id);
}

beforeAll(async () => {
  const crear = async (letra: string) => {
    const p = await db.propiedad.create({
      data: {
        nombre: `Test reseñas ${letra} ${sufijo}`,
        slug: `test-res-${letra.toLowerCase()}-${sufijo}`,
        prefijoCodigo: `R${letra}${sufijo}`.toUpperCase(),
        whatsapp: "+56900000000",
        email: "dueno@example.com",
        resenas: "completas",
      },
    });
    const c = await db.cabana.create({ data: { propiedadId: p.id, nombre: `Cabaña ${letra}`, slug: "cabana", capacidad: 4, dormitorios: 2 } });
    return { p: p.id, c: c.id };
  };
  ({ p: propiedadA, c: cabanaA } = await crear("A"));
  ({ p: propiedadB, c: cabanaB } = await crear("B"));
  const [uA, uB] = [randomUUID(), randomUUID()];
  await db.admin.createMany({
    data: [
      { usuarioId: uA, propiedadId: propiedadA, email: `dueno-a-${sufijo}@example.com`, rol: "dueno" },
      { usuarioId: uB, propiedadId: propiedadB, email: `dueno-b-${sufijo}@example.com`, rol: "dueno" },
    ],
  });
  adminA = (await cargarAdmin(uA))!;
  adminB = (await cargarAdmin(uB))!;
  await db.superadmin.create({ data: superadmin });
});

afterAll(async () => {
  const propiedades = [propiedadA, propiedadB].filter(Boolean);
  const deSusCabanas = { cabana: { propiedadId: { in: propiedades } } };
  await db.configuracionPlataforma.update({ where: { id: 1 }, data: { compartirReputacion: false } });
  const huespedes = (await db.reserva.findMany({ where: deSusCabanas, select: { huespedId: true } })).map((x) => x.huespedId).filter((x): x is string => !!x);
  await db.reserva.deleteMany({ where: deSusCabanas }); // en cascada: ciclos, reseñas, respuestas, reportes, réplicas
  await db.huesped.deleteMany({ where: { id: { in: huespedes } } });
  await db.superadmin.deleteMany({ where: { usuarioId: superadmin.usuarioId } });
  await db.admin.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.cabana.deleteMany({ where: { propiedadId: { in: propiedades } } });
  await db.propiedad.deleteMany({ where: { id: { in: propiedades } } });
  await db.$disconnect();
});

describe("elegibilidad", () => {
  it("solo reservas confirmadas con check-out pasado, dentro de 30 días", async () => {
    const pendiente = await reserva({ estado: "pendiente_pago" });
    expect((await r.escribirResenaHuesped(adminA, pendiente.codigo, { calificacion: "recomendado", etiquetas: [], comentario: "" }, pendiente.en(1))).ok).toBe(false);

    const res = await reserva();
    const antes = await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "recomendado", etiquetas: [], comentario: "" }, res.en(-1));
    expect(antes).toMatchObject({ ok: false, error: expect.stringMatching(/después del check-out/) });
    const tarde = await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "recomendado", etiquetas: [], comentario: "" }, res.en(31));
    expect(tarde).toMatchObject({ ok: false, error: expect.stringMatching(/30 días/) });
    expect((await r.pedirResenaPorWhatsapp(adminA, res.codigo, res.en(31))).ok).toBe(false);
  });

  it("una reseña por reserva y por sentido (índice único)", async () => {
    const res = await reserva();
    const token = await invitar(res);
    expect((await r.enviarResenaCabana(token, { notas, comentario }, res.en(1))).ok).toBe(true);
    await expect(
      db.resenaCabana.create({ data: { reservaId: res.id, cabanaId: cabanaA, nombrePublico: "X", ...notas, comentario } }),
    ).rejects.toThrow();
    const a = await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "recomendado", etiquetas: [], comentario: "" }, res.en(1));
    expect(a).toMatchObject({ ok: true, nuevo: true });
    expect(await db.resenaHuesped.count({ where: { reservaId: res.id } })).toBe(1);
  });
});

describe("token de la invitación", () => {
  it("sirve una sola vez: al enviar se consume y entrega otro para editar", async () => {
    const res = await reserva();
    const token = await invitar(res);
    expect((await r.abrirInvitacion(token, res.en(1))).estado).toBe("formulario");

    const envio = await r.enviarResenaCabana(token, { notas, comentario }, res.en(1));
    expect(envio).toMatchObject({ ok: true, publicada: false });
    if (!envio.ok) return;
    expect((await r.abrirInvitacion(token, res.en(1))).estado).toBe("invalido");
    expect((await r.enviarResenaCabana(token, { notas, comentario }, res.en(1))).ok).toBe(false);

    // El nuevo link edita la reseña retenida (y también se consume).
    const edicion = await r.enviarResenaCabana(envio.token, { notas: { ...notas, limpieza: 3 }, comentario }, res.en(2));
    expect(edicion.ok).toBe(true);
    expect(await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } })).toMatchObject({ limpieza: 3, ediciones: 1, nombrePublico: "Ana" });
  });

  it("rechaza tokens manipulados, de otra forma o vencidos", async () => {
    const res = await reserva();
    const token = await invitar(res);
    const otraLetra = token.endsWith("A") ? "B" : "A";
    expect((await r.abrirInvitacion(`${token.slice(0, -1)}${otraLetra}`, res.en(1))).estado).toBe("invalido");
    expect((await r.abrirInvitacion("no-es-un-token", res.en(1))).estado).toBe("invalido");
    expect((await r.abrirInvitacion(firmarToken("otro-secreto-cualquiera-de-32-caracteres!", "resena", "x", 0), res.en(1))).estado).toBe("invalido");
    expect((await r.abrirInvitacion(token, res.en(31))).estado).toBe("vencido");
    expect((await r.enviarResenaCabana(token, { notas, comentario }, res.en(31))).ok).toBe(false);
  });

  it("valida notas y comentario en el servidor y sanea el texto", async () => {
    const res = await reserva();
    const token = await invitar(res);
    expect((await r.enviarResenaCabana(token, { notas: { ...notas, limpieza: 6 }, comentario }, res.en(1))).ok).toBe(false);
    expect((await r.enviarResenaCabana(token, { notas, comentario: "corto" }, res.en(1))).ok).toBe(false);
    const ok = await r.enviarResenaCabana(token, { notas, comentario: '<img src=x onerror="alert(1)">Excelente estadía, volveremos' }, res.en(1));
    expect(ok.ok).toBe(true);
    expect((await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } })).comentario).toBe("Excelente estadía, volveremos");
  });
});

describe("doble ciego", () => {
  it("nadie ve el contenido de la otra parte hasta que están las dos; luego no se editan", async () => {
    const res = await reserva();
    const token = await invitar(res);
    const envio = await r.enviarResenaCabana(token, { notas, comentario }, res.en(1));
    if (!envio.ok) throw new Error(envio.error);

    // El dueño (RLS) y el público no la ven mientras está retenida.
    expect(await comoAdmin(adminA, (tx) => tx.resenaCabana.count({ where: { reservaId: res.id } }))).toBe(0);
    const retenida = await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } });
    expect((await r.resenasPublicas(cabanaA)).some((x) => x.id === retenida.id)).toBe(false);
    expect((await r.resenasDeReserva(adminA, res.codigo, res.en(1)))?.resenaCabanaVisible).toBe(false);

    // El dueño escribe la suya: se desbloquean las dos.
    const dueno = await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "recomendado", etiquetas: ["respetuoso", "dejo_limpio"], comentario: "Impecable" }, res.en(2));
    expect(dueno.ok).toBe(true);
    expect((await db.cicloResena.findUniqueOrThrow({ where: { reservaId: res.id } })).desbloqueadoEn).not.toBeNull();
    expect((await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } })).estado).toBe("publicada");
    expect((await db.resenaHuesped.findUniqueOrThrow({ where: { reservaId: res.id } })).estado).toBe("publicada");
    expect(await comoAdmin(adminA, (tx) => tx.resenaCabana.count({ where: { reservaId: res.id } }))).toBe(1);

    // Desbloqueado: ninguna de las dos se edita.
    expect(await r.enviarResenaCabana(envio.token, { notas, comentario: "Cambio de opinión total" }, res.en(3))).toMatchObject({ ok: false });
    expect(await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "no_recomendado", etiquetas: [], comentario: "" }, res.en(3))).toMatchObject({ ok: false });
    // Ni siquiera saltándose el código: RLS no deja actualizar una publicada.
    const directo = await comoAdmin(adminA, (tx) => tx.resenaHuesped.updateMany({ where: { reservaId: res.id }, data: { calificacion: "no_recomendado" } }));
    expect(directo.count).toBe(0);
  });

  it("se desbloquea a los 14 días aunque falte una reseña (cron)", async () => {
    const res = await reserva();
    const token = await invitar(res);
    await r.enviarResenaCabana(token, { notas, comentario }, res.en(1));
    await r.procesarResenas(res.en(13));
    expect((await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } })).estado).toBe("retenida");
    await r.procesarResenas(res.en(14));
    expect((await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } })).estado).toBe("publicada");
  });

  it("una reseña escrita después del desbloqueo se publica al tiro", async () => {
    const res = await reserva();
    await invitar(res);
    await r.procesarResenas(res.en(15));
    const token = await tokenDe(res.id);
    const envio = await r.enviarResenaCabana(token, { notas, comentario }, res.en(16));
    expect(envio).toMatchObject({ ok: true, publicada: true });
  });
});

describe("RLS entre dueños", () => {
  it("con compartir_reputacion=false un dueño NO ve reseñas del huésped de otro dueño", async () => {
    const res = await reserva({ email: `compartido-${sufijo}@example.com` });
    await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "no_recomendado", etiquetas: ["ruidoso"], comentario: "Fiesta hasta las 4" }, res.en(1));
    await r.procesarResenas(res.en(14)); // publicada

    expect(await comoAdmin(adminB, (tx) => tx.resenaHuesped.count({ where: { reservaId: res.id } }))).toBe(0);
    expect(await comoAdmin(adminB, (tx) => tx.$queryRaw<unknown[]>`select * from reputacion_compartida`)).toEqual([]);
    const h = await r.historialHuesped(adminB, { email: `Compartido-${sufijo}@example.com `, telefono: null }, "2027-12-31");
    expect(h.otros).toBeNull();
    expect(h.resenas).toEqual([]);
    expect(h.resumen.texto).toBe("0 estadías, sin reseñas");
    // El dueño A sí ve la suya, con el resumen.
    const hA = await r.historialHuesped(adminA, { email: `compartido-${sufijo}@example.com`, telefono: null }, "2027-12-31");
    expect(hA.resumen.texto).toBe("1 estadía: 1 no recomendado");
    expect(hA.resenas[0].comentario).toBe("Fiesta hasta las 4");
  });

  it("encendido (preparado), el otro dueño ve solo el resumen, nunca el comentario", async () => {
    await db.configuracionPlataforma.update({ where: { id: 1 }, data: { compartirReputacion: true } });
    try {
      const filas = await comoAdmin(adminB, (tx) => tx.$queryRaw<Record<string, unknown>[]>`select * from reputacion_compartida`);
      expect(filas.length).toBeGreaterThan(0);
      expect(Object.keys(filas[0])).not.toContain("comentario");
      const h = await r.historialHuesped(adminB, { email: `compartido-${sufijo}@example.com`, telefono: null }, "2027-12-31");
      expect(h.otros?.texto).toBe("1 estadía: 1 no recomendado");
      expect(h.resenas).toEqual([]); // el detalle sigue siendo solo del autor
      expect(await comoAdmin(adminB, (tx) => tx.resenaHuesped.count())).toBe(0);
    } finally {
      await db.configuracionPlataforma.update({ where: { id: 1 }, data: { compartirReputacion: false } });
    }
  });

  it("un dueño no responde, reporta ni pide reseñas de cabañas ajenas", async () => {
    const res = await reserva({ cabana: cabanaB });
    const token = await invitar(res);
    await r.enviarResenaCabana(token, { notas, comentario }, res.en(1));
    await r.procesarResenas(res.en(14));
    const resena = await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } });

    expect((await r.responderResena(adminA, resena.id, "Gracias")).ok).toBe(false);
    expect((await r.reportarResena(adminA, resena.id, "insultos")).ok).toBe(false);
    expect((await r.pedirResenaPorWhatsapp(adminA, res.codigo, res.en(1))).ok).toBe(false);
    expect((await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "recomendado", etiquetas: [], comentario: "" }, res.en(1))).ok).toBe(false);
    // Saltándose el código: RLS tampoco deja insertar una respuesta.
    await expect(
      comoAdmin(adminA, (tx) => tx.respuestaResena.create({ data: { resenaId: resena.id, texto: "x", autorUsuarioId: adminA.usuarioId, autorEmail: "x" } })),
    ).rejects.toThrow();
    expect((await r.responderResena(adminB, resena.id, "¡Gracias por venir!")).ok).toBe(true);
  });
});

describe("moderación", () => {
  it("el dueño no puede borrar ni editar una reseña; reporta, y una oculta no se muestra pero se conserva", async () => {
    const res = await reserva();
    const token = await invitar(res);
    await r.enviarResenaCabana(token, { notas, comentario: "Pésimo, el dueño Juan Pérez +56911111111 es un..." }, res.en(1));
    await r.procesarResenas(res.en(14));
    const resena = await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } });

    await expect(comoAdmin(adminA, (tx) => tx.resenaCabana.delete({ where: { id: resena.id } }))).rejects.toThrow();
    await expect(comoAdmin(adminA, (tx) => tx.resenaCabana.update({ where: { id: resena.id }, data: { comentario: "Excelente" } }))).rejects.toThrow();

    expect(await r.reportarResena(adminA, resena.id, "datos_personales", "Da mi teléfono")).toMatchObject({ ok: true, nuevo: true });
    expect(await r.reportarResena(adminA, resena.id, "datos_personales")).toMatchObject({ ok: true, nuevo: false });
    const cola = await r.colaModeracion();
    const reporte = cola.reportes.find((x) => x.resena.id === resena.id);
    expect(reporte).toBeDefined();
    expect((await r.resenasPublicas(cabanaA)).some((x) => x.id === resena.id)).toBe(true);

    expect((await r.resolverReporte(superadmin, reporte!.id, true)).ok).toBe(true);
    expect((await r.resenasPublicas(cabanaA)).some((x) => x.id === resena.id)).toBe(false);
    expect((await db.resenaCabana.findUniqueOrThrow({ where: { id: resena.id } })).estado).toBe("oculta");
    expect((await r.resolverReporte(superadmin, reporte!.id, true)).ok).toBe(false);
  });
});

describe("página pública y JSON-LD", () => {
  it("solo publicadas, sin datos personales, con la respuesta del dueño y valores correctos", async () => {
    const pub = await reserva({ cabana: cabanaB });
    const ret = await reserva({ cabana: cabanaB });
    await r.enviarResenaCabana(await invitar(pub), { notas: { ...notas, limpieza: 3 }, comentario: "Buena, el baño un poco frío" }, pub.en(1));
    await r.procesarResenas(pub.en(14));
    await r.enviarResenaCabana(await invitar(ret), { notas, comentario: "Retenida todavía, no se muestra" }, ret.en(1));

    const publicas = await r.resenasPublicas(cabanaB);
    expect(publicas.some((x) => x.comentario.startsWith("Retenida"))).toBe(false);
    for (const p of publicas) {
      expect(Object.keys(p).sort()).toEqual(
        ["calidadPrecio", "comentario", "comunicacion", "id", "limpieza", "nombre", "publicadaEn", "respuesta", "ubicacion", "veracidad"].sort(),
      );
      expect(p.nombre).toBe("Ana");
    }
    const conRespuesta = publicas.find((x) => x.respuesta === "¡Gracias por venir!");
    expect(conRespuesta).toBeDefined();

    const ld = jsonLdCabana({ nombre: "Cabaña B", url: "https://x.cl/b", imagen: null, descripcion: "", ubicacion: null }, publicas)!;
    expect(ld.aggregateRating.reviewCount).toBe(publicas.length);
    const esperado = Math.round((publicas.reduce((s, p) => s + (p.limpieza + p.ubicacion + p.comunicacion + p.veracidad + p.calidadPrecio) / 5, 0) / publicas.length) * 10) / 10;
    expect(ld.aggregateRating.ratingValue).toBe(esperado);
  });

  it("una reseña de una reserva de prueba ([PRUEBA]) nunca llega a la página pública", async () => {
    const res = await reserva();
    await db.reserva.update({ where: { id: res.id }, data: { notas: "[PRUEBA] Somos dos" } });
    await r.enviarResenaCabana(await invitar(res), { notas, comentario: "Reseña de prueba, no debe verse" }, res.en(1));
    await r.procesarResenas(res.en(14));
    const resena = await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } });
    expect(resena.estado).toBe("publicada");
    expect((await r.resenasPublicas(cabanaA)).some((x) => x.id === resena.id)).toBe(false);
    const panel = await r.datosResenasPanel(adminA, "2027-12-31");
    expect(panel.resenas.find((x) => x.id === resena.id)?.prueba).toBe(true);
  });

  it("la respuesta del dueño se edita durante 14 días", async () => {
    const res = await reserva();
    await r.enviarResenaCabana(await invitar(res), { notas, comentario }, res.en(1));
    await r.procesarResenas(res.en(14));
    const resena = await db.resenaCabana.findUniqueOrThrow({ where: { reservaId: res.id } });
    const hoy = new Date();
    expect(await r.responderResena(adminA, resena.id, "Gracias", hoy)).toMatchObject({ ok: true, nuevo: true });
    expect(await r.responderResena(adminA, resena.id, "¡Muchas gracias!", new Date(hoy.getTime() + 13 * DIA))).toMatchObject({ ok: true, nuevo: false });
    expect((await r.responderResena(adminA, resena.id, "Otra", new Date(hoy.getTime() + 15 * DIA))).ok).toBe(false);
  });
});

describe("cron de reseñas", () => {
  it("es idempotente: dos corridas no duplican invitaciones, recordatorios ni reseñas", async () => {
    const res = await reserva();
    await r.procesarResenas(res.en(1));
    const ciclo = await db.cicloResena.findUniqueOrThrow({ where: { reservaId: res.id } });
    expect(ciclo.invitacionEnviadaEn).not.toBeNull();
    expect(ciclo.recordatorioDuenoEn).not.toBeNull();
    expect((await db.reserva.findUniqueOrThrow({ where: { id: res.id } })).huespedId).not.toBeNull();

    const segunda = await r.procesarResenas(res.en(1));
    expect(segunda).toMatchObject({ invitaciones: 0, recordatorios: 0, recordatoriosDueno: 0 });
    expect(await db.cicloResena.count({ where: { reservaId: res.id } })).toBe(1);

    const r7 = await r.procesarResenas(res.en(7));
    const otra7 = await r.procesarResenas(res.en(7));
    expect(r7.recordatorios).toBeGreaterThanOrEqual(1);
    expect(otra7.recordatorios).toBe(0);
    expect((await db.cicloResena.findUniqueOrThrow({ where: { reservaId: res.id } })).invitacionEnviadaEn).toEqual(ciclo.invitacionEnviadaEn);
  });

  it("en una propiedad con reseñas apagadas o suspendida no invita ni deja reseñar", async () => {
    for (const cambio of [{ resenas: "apagadas" as const }, { suspendida: true }]) {
      await db.propiedad.update({ where: { id: propiedadB }, data: cambio });
      try {
        const res = await reserva({ cabana: cabanaB });
        await r.procesarResenas(res.en(1));
        expect(await db.cicloResena.count({ where: { reservaId: res.id } })).toBe(0);
        const token = await invitar(res);
        expect((await r.abrirInvitacion(token, res.en(1))).estado).toBe("no_elegible");
        expect((await r.enviarResenaCabana(token, { notas, comentario }, res.en(1))).ok).toBe(false);
      } finally {
        await db.propiedad.update({ where: { id: propiedadB }, data: { resenas: "completas", suspendida: false } });
      }
    }
  });
});

describe("derechos del huésped", () => {
  it("ve las reseñas publicadas sobre él, replica y pide rectificación; el link vence y se limita", async () => {
    const email = `derechos-${sufijo}@example.com`;
    const res = await reserva({ email });
    await r.escribirResenaHuesped(adminA, res.codigo, { calificacion: "con_reservas", etiquetas: ["ruidoso"], comentario: "Algo de ruido de noche" }, res.en(1));

    const ahora = new Date();
    await r.pedirAccesoHuesped(` ${email.toUpperCase()} `, ahora);
    const h = await db.huesped.findUniqueOrThrow({ where: { email } });
    expect(h.accesoVersion).toBe(1);
    const token = firmarToken(SECRETO, "acceso", h.id, 1);

    // Retenida: todavía no la ve.
    expect((await r.abrirAccesoHuesped(token, ahora))?.resenas).toEqual([]);
    await r.procesarResenas(res.en(14));
    const datos = await r.abrirAccesoHuesped(token, ahora);
    expect(datos?.resenas).toHaveLength(1);
    expect(datos?.huesped.email).toBe(email);

    expect((await r.replicarResena(token, datos!.resenas[0].id, "Fue solo una noche, perdón")).ok).toBe(true);
    const hA = await r.historialHuesped(adminA, { email, telefono: null }, "2027-12-31");
    expect(hA.resenas[0].replica?.texto).toBe("Fue solo una noche, perdón");

    expect((await r.solicitarPrivacidad(token, "rectificacion", "Mi teléfono cambió")).ok).toBe(true);
    expect((await r.colaModeracion()).solicitudes.some((s) => s.huesped.email === email)).toBe(true);

    // Un link cada 10 minutos; vence a las 24 h; un token inventado no entra.
    await r.pedirAccesoHuesped(email, new Date(ahora.getTime() + 60_000));
    expect((await db.huesped.findUniqueOrThrow({ where: { email } })).accesoVersion).toBe(1);
    expect(await r.abrirAccesoHuesped(token, new Date(ahora.getTime() + 25 * 3_600_000))).toBeNull();
    expect(await r.abrirAccesoHuesped(firmarToken(SECRETO, "acceso", h.id, 2), ahora)).toBeNull();
    // Un email desconocido no falla ni revela nada.
    await expect(r.pedirAccesoHuesped(`nadie-${sufijo}@example.com`)).resolves.toBeUndefined();
  });
});
