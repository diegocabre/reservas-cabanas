// Reseñas: tipos y helpers compartidos, huésped y ciclo, elegibilidad y doble ciego (evaluarDesbloqueo).

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hoyEnChile } from "@/lib/formato";
import type { Prisma } from "@/lib/generated/prisma/client";
import { aFechaIso } from "@/lib/precios";
import {
  debeDesbloquear,
  elegibilidad,
  firmarToken,
  hashToken,
  nombrePublico,
  normalizarEmail,
  normalizarTelefonoHuesped,
  resenasCabanaActivas,
  resenasHuespedActivas,
  secretoResenas,
  venceTokenResena,
  type Elegibilidad,
  type EtapaResenas,
} from "@/lib/resenas-reglas";
import { urlDelSitio } from "@/lib/sitio";

export type Tx = Prisma.TransactionClient;
export type Conexion = Tx | typeof db;

export const DIA_MS = 86_400_000;
export const ESTADOS_RESENABLES = ["confirmada", "completada"] as const;
export const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const emailValido = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

// ---------------------------------------------------------------------------------------------
// Huésped y ciclo (servidor)
// ---------------------------------------------------------------------------------------------

type ReservaHuesped = { id: string; huespedId: string | null; huespedEmail: string; huespedTelefono: string; huespedNombre: string };

/**
 * Huésped de la reserva (lo crea si no existe, por email normalizado) y lo enlaza a la reserva.
 * null si la reserva no tiene un email usable (algunas de Airbnb/Booking/manuales).
 */
export async function asegurarHuesped(cx: Conexion, r: ReservaHuesped, poblado = false): Promise<string | null> {
  if (r.huespedId) return r.huespedId;
  const email = normalizarEmail(r.huespedEmail);
  if (!emailValido(email)) return null;
  const telefono = normalizarTelefonoHuesped(r.huespedTelefono);
  // ON CONFLICT DO NOTHING: dos procesos a la vez no se pisan ni abortan la transacción.
  await cx.huesped.createMany({
    data: [{ email, telefono, nombrePila: nombrePublico(r.huespedNombre), creadoPorPoblado: poblado }],
    skipDuplicates: true,
  });
  const h = await cx.huesped.findUniqueOrThrow({ where: { email }, select: { id: true, telefono: true } });
  if (!h.telefono && telefono) await cx.huesped.updateMany({ where: { id: h.id, telefono: null }, data: { telefono } });
  // SQL directo: Prisma actualizaría reserva.updated_at, y la reserva no cambia (solo se enlaza).
  await cx.$executeRaw`update reserva set huesped_id = ${h.id}::uuid where id = ${r.id}::uuid and huesped_id is null`;
  return h.id;
}

type Ciclo = { id: string; tokenVersion: number; tokenExpiraEn: Date; invitacionEnviadaEn: Date | null; recordatorioEn: Date | null; recordatorioDuenoEn: Date | null; desbloqueadoEn: Date | null };

/** Ciclo de reseñas de la reserva (con su token versión 0), creado una sola vez. */
export async function asegurarCiclo(cx: Conexion, reservaId: string, checkOut: string): Promise<Ciclo> {
  const existente = await cx.cicloResena.findUnique({ where: { reservaId } });
  if (existente) return existente;
  const id = randomUUID();
  await cx.cicloResena.createMany({
    data: [{ id, reservaId, tokenHash: hashToken(firmarToken(secretoResenas(), "resena", id, 0)), tokenExpiraEn: venceTokenResena(checkOut) }],
    skipDuplicates: true,
  });
  return cx.cicloResena.findUniqueOrThrow({ where: { reservaId } });
}

/** Link vigente de la invitación (el mismo en el correo, el recordatorio y WhatsApp). */
export const urlResenaDeCiclo = (c: Pick<Ciclo, "id" | "tokenVersion">) =>
  new URL(`/resena/${firmarToken(secretoResenas(), "resena", c.id, c.tokenVersion)}`, urlDelSitio()).toString();

/**
 * elegibilidad() más lo que depende de la propiedad: reseñas activas (de la cabaña, o del huésped si
 * `huesped`) y no suspendida.
 */
export function elegible(
  r: { estado: string; checkOut: Date; cabana: { demo: boolean; propiedad: { resenas: EtapaResenas; suspendida: boolean } } },
  hoy: string,
  huesped = false,
): Elegibilidad {
  const p = r.cabana.propiedad;
  const activas = huesped ? resenasHuespedActivas(p.resenas) : resenasCabanaActivas(p.resenas);
  if (p.suspendida || !activas) return { ok: false, motivo: "Las reseñas no están disponibles en este alojamiento." };
  return elegibilidad({ estado: r.estado, checkOut: aFechaIso(r.checkOut), demo: r.cabana.demo }, hoy);
}

// ---------------------------------------------------------------------------------------------
// Doble ciego
// ---------------------------------------------------------------------------------------------

/**
 * Publica las reseñas de la reserva si corresponde (ambas escritas, o 14 días desde el check-out).
 * Bloquea el ciclo: si las dos partes envían a la vez, la segunda ve la primera. true si desbloqueó.
 */
export async function evaluarDesbloqueo(reservaId: string, ahora = new Date()): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ id: string; desbloqueado_en: Date | null; check_out: Date }[]>`
      select c.id, c.desbloqueado_en, r.check_out
      from ciclo_resena c join reserva r on r.id = c.reserva_id
      where c.reserva_id = ${reservaId}::uuid
      for update of c`;
    if (filas.length === 0) return false;
    // En serie: una transacción usa una sola conexión.
    const cabana = await tx.resenaCabana.count({ where: { reservaId } });
    const huesped = await tx.resenaHuesped.count({ where: { reservaId } });
    const c = filas[0];
    const toca = debeDesbloquear(
      { checkOut: aFechaIso(c.check_out), hayResenaCabana: cabana > 0, hayResenaHuesped: huesped > 0, desbloqueado: c.desbloqueado_en !== null },
      hoyEnChile(ahora),
    );
    if (!toca) return false;
    await tx.cicloResena.update({ where: { id: c.id }, data: { desbloqueadoEn: ahora } });
    await tx.resenaCabana.updateMany({ where: { reservaId, estado: "retenida" }, data: { estado: "publicada", publicadaEn: ahora } });
    await tx.resenaHuesped.updateMany({ where: { reservaId, estado: "retenida" }, data: { estado: "publicada", publicadaEn: ahora } });
    return true;
  });
}
