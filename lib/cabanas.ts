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
      propiedad: { select: { nombre: true, slug: true, ubicacion: true, urlMapa: true } },
      temporadas: { select: { hasta: true, precioNoche: true } },
    },
  });
  if (!cabana) return null;

  const { temporadas, ...resto } = cabana;
  return { ...resto, precioDesde: precioDesde(temporadas, hoyEnChile()) };
});

export type CabanaPublica = NonNullable<Awaited<ReturnType<typeof obtenerCabanaPublica>>>;

/**
 * Propiedad con sus cabañas activas para la página de la propiedad, o null si no existe.
 * Cada cabaña trae su precio "desde"; la propiedad, el menor entre sus cabañas.
 */
export const obtenerPropiedadPublica = cache(async (propiedadSlug: string) => {
  const propiedad = await db.propiedad.findUnique({
    where: { slug: propiedadSlug },
    select: {
      nombre: true,
      slug: true,
      ubicacion: true,
      urlMapa: true,
      cabanas: {
        where: { activa: true },
        orderBy: { createdAt: "asc" },
        select: {
          nombre: true,
          slug: true,
          capacidad: true,
          dormitorios: true,
          fotos: true,
          temporadas: { select: { hasta: true, precioNoche: true } },
        },
      },
    },
  });
  if (!propiedad) return null;

  const hoy = hoyEnChile();
  const cabanas = propiedad.cabanas.map(({ temporadas, ...c }) => ({ ...c, precioDesde: precioDesde(temporadas, hoy) }));
  const precios = cabanas.map((c) => c.precioDesde).filter((p): p is number => p !== null);
  return { ...propiedad, cabanas, precioDesde: precios.length ? Math.min(...precios) : null };
});

export type PropiedadPublica = NonNullable<Awaited<ReturnType<typeof obtenerPropiedadPublica>>>;
