// Reseñas: cola de moderación del superadmin (reportes y solicitudes de privacidad).

import { db } from "@/lib/db";
import type { Resultado } from "@/lib/estados-reserva";
import { nombrePublico } from "@/lib/resenas-reglas";

// ---------------------------------------------------------------------------------------------
// Superadmin (Soluciones DyS): cola de moderación
// ---------------------------------------------------------------------------------------------

export function cargarSuperadmin(usuarioId: string) {
  return db.superadmin.findUnique({ where: { usuarioId }, select: { usuarioId: true, email: true } });
}

export type Superadmin = NonNullable<Awaited<ReturnType<typeof cargarSuperadmin>>>;

export async function colaModeracion() {
  const [reportes, solicitudes] = await Promise.all([
    db.reporteResena.findMany({
      where: { estado: "pendiente" },
      select: {
        id: true,
        motivo: true,
        detalle: true,
        email: true,
        createdAt: true,
        resena: {
          select: {
            id: true,
            estado: true,
            nombrePublico: true,
            comentario: true,
            cabana: { select: { nombre: true, propiedad: { select: { nombre: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.solicitudPrivacidad.findMany({
      where: { estado: "pendiente" },
      select: { id: true, tipo: true, mensaje: true, createdAt: true, huesped: { select: { email: true, nombrePila: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { reportes, solicitudes };
}

/** Resuelve un reporte: ocultar la reseña (se conserva en la base) o descartarlo. */
export async function resolverReporte(sa: Superadmin, reporteId: string, ocultar: boolean, ahora = new Date()): Promise<Resultado> {
  return db.$transaction(async (tx) => {
    const rep = await tx.reporteResena.findUnique({ where: { id: reporteId }, select: { resenaId: true, estado: true } });
    if (!rep || rep.estado !== "pendiente") return { ok: false as const, error: "Ese reporte ya se resolvió." };
    const resuelto = { resueltoPor: sa.email, resueltoEn: ahora };
    if (ocultar) {
      await tx.resenaCabana.update({ where: { id: rep.resenaId }, data: { estado: "oculta" } });
      // Los demás reportes pendientes de la misma reseña quedan resueltos con ella.
      await tx.reporteResena.updateMany({ where: { resenaId: rep.resenaId, estado: "pendiente" }, data: { estado: "aceptado", ...resuelto } });
    } else {
      await tx.reporteResena.update({ where: { id: reporteId }, data: { estado: "descartado", ...resuelto } });
    }
    return { ok: true as const };
  });
}

/** Marca una solicitud de privacidad como atendida (la rectificación o eliminación se hace a mano). */
export async function atenderSolicitudPrivacidad(sa: Superadmin, id: string, ahora = new Date()): Promise<Resultado> {
  const { count } = await db.solicitudPrivacidad.updateMany({
    where: { id, estado: "pendiente" },
    data: { estado: "aceptado", resueltoPor: sa.email, resueltoEn: ahora },
  });
  return count ? { ok: true } : { ok: false, error: "Esa solicitud ya se atendió." };
}
