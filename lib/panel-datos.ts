// Consultas del panel sobre reservas. Toda función recibe el admin de la sesión y aplica las dos
// defensas de lib/panel-acceso.ts: filtro por sus propiedades y RLS (comoAdmin).

import { reservaOcupa } from "@/lib/disponibilidad";
import { terminosBusqueda, type FiltrosReservas } from "@/lib/filtros-reservas";
import type { Prisma } from "@/lib/generated/prisma/client";
import { comoAdmin, deSusPropiedades, type AdminSesion } from "@/lib/panel-acceso";
import type { ReservaPanel } from "@/lib/panel";
import { MARCA_REVISAR } from "@/lib/pagos";
import { aFechaIso, nochesEntre } from "@/lib/precios";
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
  const { reservas, cabanasActivas, propiedad, bloqueos } = await comoAdmin(admin, async (tx) => ({
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
    bloqueos: await tx.bloqueo.findMany({
      where: { ...filtro, desde: { lt: d(sumarDias(hoy, DIAS_RESUMEN)) }, hasta: { gt: d(hoy) } },
      select: { id: true, desde: true, hasta: true, motivo: true, cabana: { select: { nombre: true } } },
    }),
    propiedad: await tx.propiedad.findUniqueOrThrow({
      where: { id: propiedadId },
      select: { nombre: true, slug: true, ...SELECT_PUBLICACION },
    }),
  }));

  return {
    propiedad,
    cabanasActivas,
    reservas: reservas.map(aReservaPanel),
    bloqueos: bloqueos.map((b) => ({ id: b.id, cabana: b.cabana.nombre, desde: aFechaIso(b.desde), hasta: aFechaIso(b.hasta), motivo: b.motivo })),
  };
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

/** Máximo de reservas por página en la lista (el piloto tiene pocas; paginar cuando haga falta). */
export const MAXIMO_LISTA = 200;

/** Cabañas de las propiedades del admin, para el filtro de la lista. */
export function cabanasDelAdmin(admin: AdminSesion) {
  return comoAdmin(admin, (tx) =>
    tx.cabana.findMany({
      where: { propiedadId: { in: admin.propiedades.map((p) => p.id) } },
      select: { id: true, nombre: true, propiedad: { select: { nombre: true } } },
      orderBy: [{ propiedad: { nombre: "asc" } }, { nombre: "asc" }],
    }),
  );
}

/** Lista de reservas con filtros (lib/filtros-reservas.ts). Siempre dentro de las propiedades del admin. */
export async function buscarReservas(admin: AdminSesion, f: FiltrosReservas) {
  const busqueda = terminosBusqueda(f.q);
  const where: Prisma.ReservaWhereInput = {
    AND: [
      deSusPropiedades(admin),
      f.estado === "revisar" ? { notas: { contains: MARCA_REVISAR } } : f.estado !== "todas" ? { estado: f.estado } : {},
      f.cabana ? { cabanaId: f.cabana } : {},
      f.desde ? { checkOut: { gt: d(f.desde) } } : {},
      f.hasta ? { checkIn: { lte: d(f.hasta) } } : {},
      busqueda
        ? {
            OR: [
              { codigo: { contains: busqueda.codigo, mode: "insensitive" } },
              { huespedNombre: { contains: busqueda.texto, mode: "insensitive" } },
              { huespedEmail: { contains: busqueda.texto, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const filas = await comoAdmin(admin, (tx) =>
    tx.reserva.findMany({
      where,
      select: { ...SELECT_RESERVA, expiraEn: true },
      orderBy: [{ checkIn: "asc" }, { codigo: "asc" }],
      take: MAXIMO_LISTA + 1,
    }),
  );
  const ahora = new Date();
  return {
    hayMas: filas.length > MAXIMO_LISTA,
    reservas: filas.slice(0, MAXIMO_LISTA).map((r) => ({
      ...aReservaPanel(r),
      origen: r.origen,
      vencida: r.estado === "pendiente_pago" && !reservaOcupa(r, ahora),
    })),
  };
}

/** Detalle de una reserva para el panel: huésped completo, pagos y auditoría. null si no es del admin. */
export async function detalleReserva(admin: AdminSesion, codigo: string) {
  const r = await comoAdmin(admin, (tx) =>
    tx.reserva.findFirst({
      where: { codigo, ...deSusPropiedades(admin) },
      select: {
        ...SELECT_RESERVA,
        huespedRut: true,
        expiraEn: true,
        createdAt: true,
        cabana: { select: { nombre: true, propiedad: { select: { nombre: true, slug: true } } } },
        pagos: {
          select: { id: true, monto: true, estado: true, proveedor: true, refExterna: true, pagadoEn: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        auditoria: {
          select: { id: true, accion: true, email: true, estadoAntes: true, estadoDespues: true, detalle: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
  );
  if (!r) return null;
  const pagado = r.pagos.filter((p) => p.estado === "aprobado").reduce((s, p) => s + p.monto, 0);
  const noches = nochesEntre(r.checkIn, r.checkOut).length;
  return {
    ...r,
    checkIn: aFechaIso(r.checkIn),
    checkOut: aFechaIso(r.checkOut),
    noches,
    // Precio por noche solo si el total se reparte exacto (las reservas manuales pueden tener otro precio).
    precioNoche: r.total % noches === 0 ? r.total / noches : null,
    pagado,
    saldo: r.total - pagado,
    vencida: r.estado === "pendiente_pago" && !reservaOcupa(r, new Date()),
  };
}

export type DetalleReserva = NonNullable<Awaited<ReturnType<typeof detalleReserva>>>;
