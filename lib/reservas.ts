import { db } from "@/lib/db";
import { MINUTOS_PARA_PAGAR, nochesOcupadas, reservaOcupa, validarEstadia } from "@/lib/disponibilidad";
import { generarCodigoReserva } from "@/lib/codigo";
import { codigoPostgres, TRASLAPE_RESERVA } from "@/lib/errores-db";
import { hoyEnChile, ocultarEmail } from "@/lib/formato";
import { enModoPrueba } from "@/lib/sitio";
import { aFechaIso, calcularAbono, calcularPrecio, ErrorPrecio, type TemporadaPrecio } from "@/lib/precios";
import type { DatosReserva } from "@/lib/reserva-esquema";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Prefijo en `notas` de las reservas hechas en modo prueba. */
export const MARCA_PRUEBA = "[PRUEBA]";

/** Cuántos meses hacia adelante se puede reservar. */
export const MESES_RESERVABLES = 12;

/** Fecha ISO + n meses (sin hora, en UTC). */
function sumarMeses(iso: string, meses: number): string {
  const f = d(iso);
  f.setUTCMonth(f.getUTCMonth() + meses);
  return aFechaIso(f);
}

/**
 * Todo lo que necesita el calendario de reserva: cabaña, temporadas (para cotizar en el
 * navegador) y noches ocupadas desde hoy. Sin caché: la disponibilidad cambia con cada reserva.
 */
export async function obtenerDatosReserva(propiedadSlug: string, cabanaSlug: string) {
  const hoy = hoyEnChile();
  const ahora = new Date();
  const cabana = await db.cabana.findFirst({
    where: { slug: cabanaSlug, activa: true, propiedad: { slug: propiedadSlug } },
    select: {
      nombre: true,
      slug: true,
      capacidad: true,
      minNoches: true,
      fotos: true,
      propiedad: { select: { nombre: true, slug: true, abonoPct: true, politicaCancelacion: true } },
      temporadas: { select: { nombre: true, desde: true, hasta: true, precioNoche: true, minNoches: true } },
      reservas: {
        where: { estado: { in: ["pendiente_pago", "confirmada"] }, checkOut: { gt: d(hoy) } },
        select: { checkIn: true, checkOut: true, estado: true, expiraEn: true },
      },
      bloqueos: { where: { hasta: { gt: d(hoy) } }, select: { desde: true, hasta: true } },
    },
  });
  if (!cabana) return null;

  const { temporadas, reservas, bloqueos, ...resto } = cabana;
  const ocupadas = nochesOcupadas([
    ...reservas.filter((r) => reservaOcupa(r, ahora)).map((r) => ({ desde: r.checkIn, hasta: r.checkOut })),
    ...bloqueos,
  ]);

  return {
    ...resto,
    hoy,
    ultimoDia: sumarMeses(hoy, MESES_RESERVABLES),
    // Fechas como texto para pasarlas al componente cliente.
    temporadas: temporadas.map((t) => ({ ...t, desde: aFechaIso(t.desde), hasta: aFechaIso(t.hasta) })),
    ocupadas: [...ocupadas].filter((n) => n >= hoy).sort(),
  };
}

export type DatosCalendario = NonNullable<Awaited<ReturnType<typeof obtenerDatosReserva>>>;

type ClienteDb = Pick<typeof db, "reserva">;

/**
 * Pasa a `cancelada` las reservas `pendiente_pago` cuyo plazo para pagar venció.
 * La usan el cron (todas las cabañas) y crearReservaWeb (una cabaña, dentro de su transacción).
 * Devuelve cuántas reservas expiró.
 */
export async function expirarReservasVencidas(cliente: ClienteDb = db, ahora = new Date(), cabanaId?: string) {
  const { count } = await cliente.reserva.updateMany({
    where: { estado: "pendiente_pago", expiraEn: { lt: ahora }, ...(cabanaId ? { cabanaId } : {}) },
    data: { estado: "cancelada" },
  });
  return count;
}

export type ResultadoReserva = { ok: true; codigo: string } | { ok: false; error: string };

const FECHAS_TOMADAS = "Alguien acaba de reservar esas fechas. Por favor elige otras.";

class FechasNoDisponibles extends Error {}

/**
 * Crea una reserva web en estado pendiente_pago. Recalcula precio, abono y disponibilidad
 * en el servidor: no confía en nada de lo que calculó el navegador.
 */
export async function crearReservaWeb(datos: DatosReserva): Promise<ResultadoReserva> {
  const hoy = hoyEnChile();
  if (datos.checkIn < hoy) return { ok: false, error: "La fecha de llegada ya pasó. Elige otra." };
  if (datos.checkIn > sumarMeses(hoy, MESES_RESERVABLES)) {
    return { ok: false, error: `Por ahora se puede reservar hasta ${MESES_RESERVABLES} meses hacia adelante.` };
  }

  const cabana = await db.cabana.findFirst({
    where: { slug: datos.cabana, activa: true, propiedad: { slug: datos.propiedad } },
    select: {
      id: true,
      nombre: true,
      capacidad: true,
      minNoches: true,
      propiedad: { select: { id: true, abonoPct: true } },
      temporadas: { select: { nombre: true, desde: true, hasta: true, precioNoche: true, minNoches: true } },
    },
  });
  if (!cabana) return { ok: false, error: "Esta cabaña no está disponible para reservas." };

  if (datos.adultos + datos.ninos > cabana.capacidad) {
    return { ok: false, error: `La cabaña es para un máximo de ${cabana.capacidad} personas.` };
  }

  let total: number;
  try {
    total = calcularPrecio({
      cabana: { nombre: cabana.nombre, minNoches: cabana.minNoches },
      temporadas: cabana.temporadas satisfies TemporadaPrecio[],
      checkIn: datos.checkIn,
      checkOut: datos.checkOut,
    }).total;
  } catch (e) {
    if (e instanceof ErrorPrecio) return { ok: false, error: e.message };
    throw e;
  }
  const abono = calcularAbono(total, cabana.propiedad.abonoPct);

  const { prefijoCodigo } = await db.propiedad.findUniqueOrThrow({
    where: { id: cabana.propiedad.id },
    select: { prefijoCodigo: true },
  });
  const reserva = { cabanaId: cabana.id, datos, total, abono, ahora: new Date() };

  // Código aleatorio. Si por azar ya existe (1 en ~887 millones), se reintenta con otro.
  for (let intento = 1; ; intento++) {
    try {
      return await insertarReservaWeb(generarCodigoReserva(prefijoCodigo), reserva);
    } catch (e) {
      if (esCodigoRepetido(e) && intento < 5) continue;
      throw e;
    }
  }
}

async function insertarReservaWeb(
  codigo: string,
  { cabanaId, datos, total, abono, ahora }: { cabanaId: string; datos: DatosReserva; total: number; abono: number; ahora: Date },
): Promise<ResultadoReserva> {
  try {
    await db.$transaction(async (tx) => {
      // Las reservas pendientes que ya vencieron liberan sus fechas.
      await expirarReservasVencidas(tx, ahora, cabanaId);

      // Los bloqueos no están en la restricción de la base: se revisan aquí.
      const bloqueos = await tx.bloqueo.findMany({
        where: { cabanaId, desde: { lt: d(datos.checkOut) }, hasta: { gt: d(datos.checkIn) } },
        select: { desde: true, hasta: true },
      });
      if (!validarEstadia(datos.checkIn, datos.checkOut, nochesOcupadas(bloqueos)).disponible) {
        throw new FechasNoDisponibles();
      }

      // Si otra reserva activa se traslapa, Postgres rechaza el INSERT (reserva_sin_traslape).
      await tx.reserva.create({
        data: {
          codigo,
          cabanaId,
          checkIn: d(datos.checkIn),
          checkOut: d(datos.checkOut),
          adultos: datos.adultos,
          ninos: datos.ninos,
          huespedNombre: datos.nombre,
          huespedEmail: datos.email,
          huespedTelefono: datos.telefono,
          huespedRut: datos.rut,
          total,
          abono,
          estado: "pendiente_pago",
          origen: "web",
          expiraEn: new Date(ahora.getTime() + MINUTOS_PARA_PAGAR * 60_000),
          // En modo prueba la reserva queda marcada, para poder identificarla y limpiarla después.
          notas: enModoPrueba() ? [MARCA_PRUEBA, datos.notas].filter(Boolean).join(" ") : datos.notas || null,
        },
      });
    });
    return { ok: true, codigo };
  } catch (e) {
    if (e instanceof FechasNoDisponibles || codigoPostgres(e) === TRASLAPE_RESERVA) {
      return { ok: false, error: FECHAS_TOMADAS };
    }
    throw e;
  }
}

/** ¿El error es por un código de reserva que ya existe? (índice único de `codigo`). */
function esCodigoRepetido(e: unknown): boolean {
  const err = e as { code?: string; meta?: unknown };
  const sobreCodigo = JSON.stringify(err?.meta ?? {}).includes("codigo");
  return (err?.code === "P2002" || codigoPostgres(e) === "23505") && sobreCodigo;
}

/**
 * ¿Existe una reserva con este código Y este email? Para "Buscar mi reserva": se exigen los
 * dos datos, así nadie puede encontrar reservas ajenas probando códigos.
 */
export async function existeReserva(codigo: string, email: string): Promise<boolean> {
  const reserva = await db.reserva.findUnique({ where: { codigo }, select: { huespedEmail: true } });
  return Boolean(reserva && reserva.huespedEmail.trim().toLowerCase() === email.trim().toLowerCase());
}

/** Reserva para la página de confirmación. No expone email, teléfono ni RUT. */
export async function obtenerReservaPublica(codigo: string) {
  const reserva = await db.reserva.findUnique({
    where: { codigo },
    select: {
      codigo: true,
      checkIn: true,
      checkOut: true,
      adultos: true,
      ninos: true,
      huespedNombre: true,
      huespedEmail: true,
      total: true,
      abono: true,
      estado: true,
      expiraEn: true,
      notas: true,
      pagos: { select: { estado: true } },
      cabana: {
        select: {
          nombre: true,
          slug: true,
          fotos: true,
          propiedad: {
            select: {
              nombre: true,
              slug: true,
              ubicacion: true,
              urlMapa: true,
              whatsapp: true,
              politicaCancelacion: true,
              instruccionesLlegada: true,
            },
          },
        },
      },
    },
  });
  if (!reserva) return null;

  const { huespedNombre, huespedEmail, checkIn, checkOut, notas, pagos, ...resto } = reserva;
  // Solo nombre e inicial del apellido: el código es fácil de adivinar.
  const [nombre, apellido] = huespedNombre.split(/\s+/);
  return {
    ...resto,
    checkIn: aFechaIso(checkIn),
    checkOut: aFechaIso(checkOut),
    huesped: apellido ? `${nombre} ${apellido[0]}.` : nombre,
    emailOculto: ocultarEmail(huespedEmail),
    prueba: notas?.startsWith(MARCA_PRUEBA) ?? false,
    pagoEnProceso: pagos.some((p) => p.estado === "pendiente"),
    vencida: reserva.estado === "pendiente_pago" && !reservaOcupa(reserva, new Date()),
  };
}
