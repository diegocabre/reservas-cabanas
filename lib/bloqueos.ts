// Bloqueos de fechas que crea el dueño (vendidas en Airbnb o Booking, mantención, uso personal).
// Funciones puras. Rangos semiabiertos [desde, hasta): `hasta` es el día en que la cabaña se libera,
// igual que el check-out de una reserva. En pantalla el dueño elige primera y última noche bloqueada.

import { aFechaIso, nochesEntre, type Fecha } from "@/lib/precios";

export const MOTIVOS_BLOQUEO = ["airbnb", "booking", "mantencion", "uso_personal"] as const;
export type MotivoBloqueo = (typeof MOTIVOS_BLOQUEO)[number];

export const NOMBRE_MOTIVO: Record<MotivoBloqueo, string> = {
  airbnb: "Reservada en Airbnb",
  booking: "Reservada en Booking",
  mantencion: "Mantención",
  uso_personal: "Uso personal",
};

/** Nombre del motivo guardado; los textos libres (bloqueos antiguos o de iCal) se muestran tal cual. */
export function nombreMotivo(motivo: string | null): string {
  if (!motivo) return "Sin motivo";
  return (NOMBRE_MOTIVO as Record<string, string>)[motivo] ?? motivo;
}

/** Máximo de noches de un bloqueo (un año): evita bloquear por error la cabaña para siempre. */
export const MAXIMO_NOCHES_BLOQUEO = 366;

const DIA_MS = 86_400_000;
export const sumarDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** ¿Se superponen dos rangos [desde, hasta)? Tocarse en un borde (salida = llegada) no es superponerse. */
export function seSuperponen(a: { desde: Fecha; hasta: Fecha }, b: { desde: Fecha; hasta: Fecha }): boolean {
  return aFechaIso(a.desde) < aFechaIso(b.hasta) && aFechaIso(b.desde) < aFechaIso(a.hasta);
}

export type RangoBloqueo = { desde: string; hasta: string; noches: number };

/**
 * Valida lo que eligió el dueño (primera y última noche, inclusive) y lo convierte al rango
 * semiabierto que se guarda: hasta = última noche + 1.
 */
export function rangoDeBloqueo(
  p: { primeraNoche: string; ultimaNoche: string; hoy: string },
): { ok: true; rango: RangoBloqueo } | { ok: false; error: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(p.primeraNoche) || !iso.test(p.ultimaNoche)) return { ok: false, error: "Elige la primera y la última noche." };
  if (p.ultimaNoche < p.primeraNoche) return { ok: false, error: "La última noche no puede ser antes de la primera." };
  if (p.primeraNoche < p.hoy) return { ok: false, error: "No se pueden bloquear noches que ya pasaron." };
  const hasta = sumarDias(p.ultimaNoche, 1);
  const noches = nochesEntre(p.primeraNoche, hasta).length;
  if (noches > MAXIMO_NOCHES_BLOQUEO) return { ok: false, error: `Un bloqueo puede durar como máximo ${MAXIMO_NOCHES_BLOQUEO} noches.` };
  return { ok: true, rango: { desde: p.primeraNoche, hasta, noches } };
}

/** Elementos (reservas o bloqueos) que se superponen con un rango, ordenados por fecha. */
export function conflictos<T extends { desde: Fecha; hasta: Fecha }>(rango: { desde: Fecha; hasta: Fecha }, otros: T[]): T[] {
  return otros.filter((o) => seSuperponen(rango, o)).sort((a, b) => aFechaIso(a.desde).localeCompare(aFechaIso(b.desde)));
}

/** "12 al 14 de octubre de 2026 (3 noches)": texto para la auditoría y la lista. */
export function describirRango(r: { desde: Fecha; hasta: Fecha }, formatoLargo: (iso: string) => string): string {
  const noches = nochesEntre(r.desde, r.hasta).length;
  const ultima = sumarDias(aFechaIso(r.hasta), -1);
  const texto = noches === 1 ? `noche del ${formatoLargo(aFechaIso(r.desde))}` : `${formatoLargo(aFechaIso(r.desde))} al ${formatoLargo(ultima)}`;
  return `${texto} (${noches} ${noches === 1 ? "noche" : "noches"})`;
}
