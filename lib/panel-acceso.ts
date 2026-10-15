// Acceso a datos del panel del dueño, con dos defensas:
// 1. Filtro en el código: cada consulta incluye las propiedades del admin (deSusPropiedades).
// 2. RLS en Postgres: comoAdmin() corre la consulta con el rol panel_admin y el id del usuario;
//    las políticas (migración admin_por_propiedad_y_rls_panel) solo le muestran sus propiedades.
// Sin imports de Next: se usa desde el panel, desde scripts y desde los tests contra la base.

import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export interface PropiedadAdmin {
  id: string;
  nombre: string;
  slug: string;
  rol: "dueno" | "staff";
}

/** Usuario con sesión iniciada que administra al menos una propiedad. */
export interface AdminSesion {
  usuarioId: string;
  email: string;
  propiedades: PropiedadAdmin[];
}

/** Propiedades que administra un usuario de Supabase Auth, o null si no administra ninguna. */
export async function cargarAdmin(usuarioId: string): Promise<AdminSesion | null> {
  const filas = await db.admin.findMany({
    where: { usuarioId },
    select: { email: true, rol: true, propiedad: { select: { id: true, nombre: true, slug: true } } },
    orderBy: { propiedad: { nombre: "asc" } },
  });
  if (filas.length === 0) return null;
  return {
    usuarioId,
    email: filas[0].email,
    propiedades: filas.map((f) => ({ ...f.propiedad, rol: f.rol })),
  };
}

export type TxPanel = Prisma.TransactionClient;

/**
 * Corre `fn` en una transacción donde Postgres aplica RLS como este admin: con el rol
 * panel_admin (sin BYPASSRLS) y app.usuario_id = su usuario. `set local` dura solo la transacción,
 * así que la conexión vuelve limpia al pool.
 */
export function comoAdmin<T>(
  admin: Pick<AdminSesion, "usuarioId">,
  fn: (tx: TxPanel) => Promise<T>,
  opciones?: { timeout?: number },
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("set local role panel_admin");
    await tx.$queryRaw`select set_config('app.usuario_id', ${admin.usuarioId}, true)`;
    return fn(tx);
  }, opciones);
}

/** Ids de las propiedades del admin. Si se pide una, debe ser suya (si no, ninguna). */
export function idsPropiedades(admin: AdminSesion, propiedadId?: string): string[] {
  const ids = admin.propiedades.map((p) => p.id);
  if (propiedadId === undefined) return ids;
  return ids.includes(propiedadId) ? [propiedadId] : [];
}

/** Filtro de Prisma para reservas, bloqueos o tarifas: solo cabañas de las propiedades del admin. */
export function deSusPropiedades(admin: AdminSesion, propiedadId?: string) {
  return { cabana: { propiedadId: { in: idsPropiedades(admin, propiedadId) } } } as const;
}
