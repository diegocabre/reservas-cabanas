// Panel de Plataforma (Soluciones DyS, solo superadmin): suspender o reactivar propiedades según su
// pago y elegir qué reseñas tiene cada una. Corre con el servidor (postgres): el rol del panel no
// puede cambiar "propiedad". Quien llama ya verificó al superadmin (requerirSuperadmin).
// Sin imports de Next: las Server Actions la envuelven; los tests la llaman directo.

import { db } from "@/lib/db";
import type { Resultado } from "@/lib/estados-reserva";
import type { EtapaResenas } from "@/lib/resenas-reglas";
import type { Superadmin } from "@/lib/resenas";

const ETAPAS: EtapaResenas[] = ["apagadas", "cabana", "completas"];

/** Propiedades con lo que el superadmin necesita para decidir: cabañas, admins y reservas por venir. */
export async function listarPropiedades(hoy: string) {
  const propiedades = await db.propiedad.findMany({
    select: {
      id: true,
      nombre: true,
      slug: true,
      suspendida: true,
      suspendidaEn: true,
      suspendidaPor: true,
      resenas: true,
      admins: { select: { email: true, rol: true }, orderBy: { email: "asc" } },
      _count: { select: { cabanas: { where: { activa: true, demo: false } } } },
    },
    orderBy: { nombre: "asc" },
  });
  // Reservas que todavía no terminan: al suspender, esos huéspedes se quedan sin anfitrión en el panel.
  const vigentes = await db.reserva.groupBy({
    by: ["cabanaId"],
    where: { estado: { in: ["confirmada", "pendiente_pago", "pendiente_aprobacion", "aprobada_pendiente_pago"] }, checkOut: { gt: new Date(`${hoy}T00:00:00Z`) } },
    _count: true,
  });
  const cabanas = await db.cabana.findMany({ where: { id: { in: vigentes.map((v) => v.cabanaId) } }, select: { id: true, propiedadId: true } });
  const porPropiedad = new Map<string, number>();
  for (const v of vigentes) {
    const p = cabanas.find((c) => c.id === v.cabanaId)?.propiedadId;
    if (p) porPropiedad.set(p, (porPropiedad.get(p) ?? 0) + v._count);
  }
  return propiedades.map(({ _count, ...p }) => ({ ...p, cabanas: _count.cabanas, reservasVigentes: porPropiedad.get(p.id) ?? 0 }));
}

/**
 * Suspende o reactiva una propiedad. Suspendida: no aparece en el sitio, no recibe reservas y sus
 * admins no entran al panel. Las reservas existentes no se tocan (el huésped sigue viendo la suya).
 */
export async function cambiarSuspension(sa: Superadmin, propiedadId: string, suspender: boolean, ahora = new Date()): Promise<Resultado> {
  const { count } = await db.propiedad.updateMany({
    where: { id: propiedadId, suspendida: !suspender },
    data: suspender ? { suspendida: true, suspendidaEn: ahora, suspendidaPor: sa.email } : { suspendida: false, suspendidaEn: null, suspendidaPor: null },
  });
  return count ? { ok: true } : { ok: false, error: suspender ? "Esa propiedad ya estaba suspendida." : "Esa propiedad ya estaba activa." };
}

/** Elige qué reseñas tiene una propiedad. */
export async function elegirResenas(propiedadId: string, etapa: string): Promise<Resultado> {
  if (!ETAPAS.includes(etapa as EtapaResenas)) return { ok: false, error: "Etapa de reseñas inválida." };
  if (etapa !== "apagadas" && !process.env.RESENAS_SECRETO) {
    return { ok: false, error: "Falta RESENAS_SECRETO en Vercel: sin él no se pueden enviar los links de reseña." };
  }
  const { count } = await db.propiedad.updateMany({ where: { id: propiedadId }, data: { resenas: etapa as EtapaResenas } });
  return count ? { ok: true } : { ok: false, error: "No existe esa propiedad." };
}
