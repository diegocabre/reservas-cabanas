// Consultas del panel sobre reservas. Toda función recibe el admin de la sesión y aplica las dos
// defensas de lib/panel-acceso.ts: filtro por sus propiedades y RLS (comoAdmin).

import { comoAdmin, deSusPropiedades, type AdminSesion } from "@/lib/panel-acceso";

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
