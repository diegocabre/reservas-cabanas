// Filtros de la lista de reservas del panel, leídos de la URL (?estado=&cabana=&desde=&hasta=&q=).
// Funciones puras: cualquier valor raro de la URL se descarta, nunca llega a la consulta.

import { normalizarCodigo } from "@/lib/codigo";

export const ESTADOS_FILTRO = ["todas", "pendiente_pago", "confirmada", "cancelada", "completada", "revisar"] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

export const NOMBRE_FILTRO: Record<EstadoFiltro, string> = {
  todas: "Todas",
  pendiente_pago: "Pendientes",
  confirmada: "Confirmadas",
  cancelada: "Canceladas",
  completada: "Completadas",
  revisar: "Revisar pago",
};

export interface FiltrosReservas {
  estado: EstadoFiltro;
  /** Id de una cabaña (se valida contra las cabañas del admin al consultar). */
  cabana: string | null;
  /** Estadías que tocan [desde, hasta] (ambos inclusive, como los elige el dueño). */
  desde: string | null;
  hasta: string | null;
  /** Nombre, email o código del huésped. */
  q: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parametros = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Lee los filtros de la URL. Sin parámetro `desde`, la lista parte hoy (lo que viene);
 * con `desde=` vacío, muestra también las pasadas.
 */
export function leerFiltros(p: Parametros, hoy: string): FiltrosReservas {
  const estado = uno(p.estado);
  const cabana = uno(p.cabana);
  const desdeParam = uno(p.desde);
  const hasta = uno(p.hasta);
  let desde = desdeParam === undefined ? hoy : ISO.test(desdeParam) ? desdeParam : null;
  let hastaOk = hasta && ISO.test(hasta) ? hasta : null;
  if (desde && hastaOk && hastaOk < desde) [desde, hastaOk] = [hastaOk, desde];
  return {
    estado: ESTADOS_FILTRO.includes(estado as EstadoFiltro) ? (estado as EstadoFiltro) : "todas",
    cabana: cabana && UUID.test(cabana) ? cabana : null,
    desde,
    hasta: hastaOk,
    q: (uno(p.q) ?? "").trim().slice(0, 80),
  };
}

/** Variantes de búsqueda: el texto tal cual (nombre, email) y como código ("ma 7k3" → "MA-7K3"). */
export function terminosBusqueda(q: string): { texto: string; codigo: string } | null {
  if (!q) return null;
  return { texto: q, codigo: normalizarCodigo(q) };
}

/** ¿Hay algún filtro distinto del inicial? (para ofrecer "Limpiar filtros"). */
export function hayFiltros(f: FiltrosReservas, hoy: string): boolean {
  return f.estado !== "todas" || f.cabana !== null || f.desde !== hoy || f.hasta !== null || f.q !== "";
}
