// Bloqueos de fechas desde el panel. Igual que las acciones sobre reservas: una transacción con RLS
// (comoAdmin), revalidación en el servidor y auditoría de quién bloqueó o liberó cada fecha.

import { ESTADOS_QUE_OCUPAN } from "@/lib/estados-reserva";
import { conflictos, describirRango, nombreMotivo, rangoDeBloqueo, type MotivoBloqueo } from "@/lib/bloqueos";
import { reservaOcupa } from "@/lib/disponibilidad";
import { cerrojoCabana } from "@/lib/errores-db";
import { formatearFechaLarga } from "@/lib/formato";
import { comoAdmin, idsPropiedades, type AdminSesion } from "@/lib/panel-acceso";
import { ErrorAccion, ejecutar } from "@/lib/panel-acciones";
import { aFechaIso } from "@/lib/precios";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Reserva que impide un bloqueo: se muestra al dueño para que sepa con qué choca. */
export type ConflictoReserva = { codigo: string; huesped: string; estado: string; desde: string; hasta: string };

export type ResultadoBloqueo =
  | { ok: true; id: string }
  | { ok: false; error: string; reservas?: ConflictoReserva[] };

// No hereda de ErrorAccion: ejecutar() la deja pasar y crearBloqueo la convierte en resultado con la lista.
class ConflictoConReservas extends Error {
  constructor(readonly reservas: ConflictoReserva[]) {
    super(
      reservas.length === 1
        ? "Esas fechas tienen una reserva. Cancélala o elige otras fechas."
        : `Esas fechas tienen ${reservas.length} reservas. Cancélalas o elige otras fechas.`,
    );
  }
}

/**
 * Bloquea noches de una cabaña del admin. Rechaza si hay reservas confirmadas o pendientes que
 * todavía ocupan esas noches (devuelve cuáles), o si ya hay otro bloqueo encima.
 */
export async function crearBloqueo(
  admin: AdminSesion,
  datos: { cabanaId: string; primeraNoche: string; ultimaNoche: string; motivo: MotivoBloqueo },
  hoy: string,
  ahora = new Date(),
): Promise<ResultadoBloqueo> {
  const v = rangoDeBloqueo({ primeraNoche: datos.primeraNoche, ultimaNoche: datos.ultimaNoche, hoy });
  if (!v.ok) return v;
  const { rango } = v;

  try {
    const r = await ejecutar(admin, async (tx) => {
      const cabana = await tx.cabana.findFirst({
        where: { id: datos.cabanaId, propiedadId: { in: idsPropiedades(admin) } },
        select: { id: true, nombre: true },
      });
      if (!cabana) throw new ErrorAccion("No encontramos esa cabaña en tus propiedades.");
      await cerrojoCabana(tx, cabana.id);

      const enEsasFechas = { cabanaId: cabana.id, checkIn: { lt: d(rango.hasta) }, checkOut: { gt: d(rango.desde) } };
      const reservas = (
        await tx.reserva.findMany({
          where: { ...enEsasFechas, estado: { in: [...ESTADOS_QUE_OCUPAN] } },
          select: { codigo: true, huespedNombre: true, estado: true, expiraEn: true, checkIn: true, checkOut: true },
        })
      ).filter((x) => reservaOcupa(x, ahora)); // una pendiente vencida ya no ocupa
      if (reservas.length) {
        throw new ConflictoConReservas(
          conflictos(
            rango,
            reservas.map((x) => ({
              codigo: x.codigo,
              huesped: x.huespedNombre,
              estado: x.estado,
              desde: aFechaIso(x.checkIn),
              hasta: aFechaIso(x.checkOut),
            })),
          ),
        );
      }

      const otro = await tx.bloqueo.findFirst({
        where: { cabanaId: cabana.id, desde: { lt: d(rango.hasta) }, hasta: { gt: d(rango.desde) } },
        select: { desde: true, hasta: true },
      });
      if (otro) {
        throw new ErrorAccion(`Ya hay un bloqueo en esas fechas: ${describirRango(otro, formatearFechaLarga)}.`);
      }

      const bloqueo = await tx.bloqueo.create({
        data: { cabanaId: cabana.id, desde: d(rango.desde), hasta: d(rango.hasta), motivo: datos.motivo, origen: "manual" },
        select: { id: true },
      });
      await tx.auditoria.create({
        data: {
          cabanaId: cabana.id,
          bloqueoId: bloqueo.id,
          usuarioId: admin.usuarioId,
          email: admin.email,
          accion: "crear_bloqueo",
          detalle: `${cabana.nombre}: ${describirRango(rango, formatearFechaLarga)}. ${nombreMotivo(datos.motivo)}`,
        },
      });
      return { id: bloqueo.id };
    });
    return r;
  } catch (e) {
    if (e instanceof ConflictoConReservas) return { ok: false, error: e.message, reservas: e.reservas };
    throw e;
  }
}

/** Elimina un bloqueo manual de una cabaña del admin y deja la auditoría. */
export function eliminarBloqueo(admin: AdminSesion, bloqueoId: string) {
  return ejecutar(admin, async (tx) => {
    const b = await tx.bloqueo.findFirst({
      where: { id: bloqueoId, cabana: { propiedadId: { in: idsPropiedades(admin) } } },
      select: { id: true, cabanaId: true, desde: true, hasta: true, motivo: true, origen: true, cabana: { select: { nombre: true } } },
    });
    if (!b) throw new ErrorAccion("No encontramos ese bloqueo en tus propiedades.");
    if (b.origen !== "manual") {
      throw new ErrorAccion("Este bloqueo viene del calendario de Airbnb o Booking: se libera allá.");
    }
    await tx.bloqueo.delete({ where: { id: b.id } });
    await tx.auditoria.create({
      data: {
        cabanaId: b.cabanaId,
        bloqueoId: b.id,
        usuarioId: admin.usuarioId,
        email: admin.email,
        accion: "eliminar_bloqueo",
        detalle: `${b.cabana.nombre}: ${describirRango(b, formatearFechaLarga)}. ${nombreMotivo(b.motivo)}`,
      },
    });
    return { id: b.id };
  });
}

/** Bloqueos vigentes y futuros de las cabañas del admin, con quién los creó. */
export function listarBloqueos(admin: AdminSesion, hoy: string) {
  return comoAdmin(admin, async (tx) => {
    const bloqueos = await tx.bloqueo.findMany({
      where: { cabana: { propiedadId: { in: idsPropiedades(admin) } }, hasta: { gt: d(hoy) } },
      select: {
        id: true,
        desde: true,
        hasta: true,
        motivo: true,
        origen: true,
        cabana: { select: { nombre: true, propiedad: { select: { nombre: true } } } },
      },
      orderBy: { desde: "asc" },
    });
    const creaciones = await tx.auditoria.findMany({
      where: { accion: "crear_bloqueo", bloqueoId: { in: bloqueos.map((b) => b.id) } },
      select: { bloqueoId: true, email: true, createdAt: true },
    });
    const creadoPor = new Map(creaciones.map((c) => [c.bloqueoId, c]));
    return bloqueos.map((b) => ({
      ...b,
      desde: aFechaIso(b.desde),
      hasta: aFechaIso(b.hasta),
      creadoPor: creadoPor.get(b.id) ?? null,
    }));
  });
}

export type BloqueoListado = Awaited<ReturnType<typeof listarBloqueos>>[number];
