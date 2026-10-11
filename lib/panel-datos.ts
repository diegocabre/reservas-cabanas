// Consultas del panel sobre reservas. Toda función recibe el admin de la sesión y aplica las dos
// defensas de lib/panel-acceso.ts: filtro por sus propiedades y RLS (comoAdmin).

import { comoAdmin, deSusPropiedades, type AdminSesion } from "@/lib/panel-acceso";
import type { ReservaPanel } from "@/lib/panel";
import { MARCA_REVISAR } from "@/lib/pagos";
import { aFechaIso } from "@/lib/precios";
import { SELECT_PUBLICACION } from "@/lib/publicacion";

const SELECT_RESERVA = {
  id: true,
  codigo: true,
  checkIn: true,
  checkOut: true,
  adultos: true,
  ninos: true,
  huespedNombre: true,
  huespedEmail: true,
  huespedTelefono: true,
  total: true,
  abono: true,
  estado: true,
  origen: true,
  notas: true,
  cabana: { select: { nombre: true, propiedadId: true } },
  pagos: { select: { monto: true, estado: true, proveedor: true } },
} as const;

/** Reservas de las propiedades del admin (o de una de ellas), por fecha de llegada. */
export function listarReservas(admin: AdminSesion, propiedadId?: string) {
  return comoAdmin(admin, (tx) =>
    tx.reserva.findMany({
      where: deSusPropiedades(admin, propiedadId),
      select: SELECT_RESERVA,
      orderBy: { checkIn: "asc" },
    }),
  );
}

/** Una reserva por código, solo si es de una propiedad del admin. */
export function obtenerReserva(admin: AdminSesion, codigo: string) {
  return comoAdmin(admin, (tx) =>
    tx.reserva.findFirst({ where: { codigo, ...deSusPropiedades(admin) }, select: SELECT_RESERVA }),
  );
}

/** Cambia las notas internas de una reserva. Devuelve false si no existe o no es del admin. */
export async function anotarReserva(admin: AdminSesion, codigo: string, notas: string): Promise<boolean> {
  const { count } = await comoAdmin(admin, (tx) =>
    tx.reserva.updateMany({ where: { codigo, ...deSusPropiedades(admin) }, data: { notas } }),
  );
  return count === 1;
}

const DIA_MS = 86_400_000;
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const sumarDias = (iso: string, n: number) => new Date(d(iso).getTime() + n * DIA_MS).toISOString().slice(0, 10);

/** Días hacia adelante que cubre el resumen (ocupación y próximas llegadas). */
export const DIAS_RESUMEN = 30;

/**
 * Datos del resumen del día de UNA propiedad del admin: reservas que tocan [hoy - 30, hoy + 30)
 * (saldos de estadías recientes, alojados, llegadas, salidas y ocupación), las marcadas
 * [REVISAR PAGO] de cualquier fecha y las cabañas activas. null si la propiedad no es suya.
 */
export async function datosResumen(admin: AdminSesion, propiedadId: string, hoy: string) {
  if (!admin.propiedades.some((p) => p.id === propiedadId)) return null;

  const filtro = deSusPropiedades(admin, propiedadId);
  const { reservas, cabanasActivas, propiedad } = await comoAdmin(admin, async (tx) => ({
    reservas: await tx.reserva.findMany({
      where: {
        ...filtro,
        OR: [
          {
            estado: { in: ["confirmada", "completada"] },
            checkOut: { gte: d(sumarDias(hoy, -DIAS_RESUMEN)) },
            checkIn: { lt: d(sumarDias(hoy, DIAS_RESUMEN)) },
          },
          { notas: { contains: MARCA_REVISAR } },
        ],
      },
      select: SELECT_RESERVA,
    }),
    cabanasActivas: await tx.cabana.count({ where: { propiedadId, activa: true } }),
    propiedad: await tx.propiedad.findUniqueOrThrow({
      where: { id: propiedadId },
      select: { nombre: true, slug: true, ...SELECT_PUBLICACION },
    }),
  }));

  return { propiedad, cabanasActivas, reservas: reservas.map(aReservaPanel) };
}

/** Reserva de la base → forma que usan los cálculos de lib/panel.ts. */
export function aReservaPanel(r: {
  codigo: string;
  checkIn: Date;
  checkOut: Date;
  adultos: number;
  ninos: number;
  huespedNombre: string;
  huespedTelefono: string;
  total: number;
  estado: ReservaPanel["estado"];
  notas: string | null;
  cabana: { nombre: string };
  pagos: { monto: number; estado: string }[];
}): ReservaPanel {
  return {
    codigo: r.codigo,
    cabana: r.cabana.nombre,
    huesped: r.huespedNombre,
    telefono: r.huespedTelefono,
    checkIn: aFechaIso(r.checkIn),
    checkOut: aFechaIso(r.checkOut),
    estado: r.estado,
    total: r.total,
    pagado: r.pagos.filter((p) => p.estado === "aprobado").reduce((s, p) => s + p.monto, 0),
    personas: r.adultos + r.ninos,
    notas: r.notas,
  };
}
