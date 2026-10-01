import { cache } from "react";
import { db } from "@/lib/db";
import { hoyEnChile } from "@/lib/formato";
import { precioDesde } from "@/lib/precios";

/**
 * Cabaña activa para la página pública, o null si no existe / está inactiva.
 * Envuelta en cache(): generateMetadata y la página comparten una sola consulta por request.
 */
export const obtenerCabanaPublica = cache(async (propiedadSlug: string, cabanaSlug: string) => {
  const cabana = await db.cabana.findFirst({
    where: { slug: cabanaSlug, activa: true, propiedad: { slug: propiedadSlug } },
    select: {
      nombre: true,
      slug: true,
      capacidad: true,
      dormitorios: true,
      descripcion: true,
      servicios: true,
      fotos: true,
      minNoches: true,
      propiedad: { select: { nombre: true, slug: true } },
      temporadas: { select: { hasta: true, precioNoche: true } },
    },
  });
  if (!cabana) return null;

  const { temporadas, ...resto } = cabana;
  return { ...resto, precioDesde: precioDesde(temporadas, hoyEnChile()) };
});

export type CabanaPublica = NonNullable<Awaited<ReturnType<typeof obtenerCabanaPublica>>>;
