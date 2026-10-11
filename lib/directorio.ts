// Directorio de la portada: todas las propiedades publicadas (funciones puras).

export interface PropiedadDirectorio {
  slug: string;
  nombre: string;
  /** Motivo por el que no puede publicarse (datos PENDIENTE fuera del modo prueba), o null. */
  bloqueo: string | null;
  cabanas: { slug: string; demo: boolean }[];
}

/**
 * Propiedades que se muestran en la portada: con al menos una cabaña listada y que pueden
 * publicarse. Las reales primero; las de demostración (todas sus cabañas demo) al final.
 * Las cabañas demo ya vienen excluidas fuera del modo prueba (lib/cabanas.ts).
 */
export function propiedadesVisibles<T extends PropiedadDirectorio>(propiedades: T[]): T[] {
  const esDemo = (p: T) => p.cabanas.every((c) => c.demo);
  return propiedades
    .filter((p) => p.cabanas.length > 0 && !p.bloqueo)
    .sort((a, b) => Number(esDemo(a)) - Number(esDemo(b)) || a.nombre.localeCompare(b.nombre, "es"));
}

/** A dónde lleva una propiedad: directo a su cabaña si tiene una sola; si no, a la lista de sus cabañas. */
export function destinoPropiedad(p: Pick<PropiedadDirectorio, "slug" | "cabanas">): string {
  return p.cabanas.length === 1 ? `/${p.slug}/${p.cabanas[0].slug}` : `/${p.slug}`;
}
