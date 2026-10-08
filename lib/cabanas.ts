import { cache } from "react";
import { db } from "@/lib/db";
import { galeriaDeCabana } from "@/lib/galeria";
import { precioDesde } from "@/lib/precios";
import { bloqueoPublicacion, datosPendientes, SELECT_PUBLICACION } from "@/lib/publicacion";
import { enModoPrueba } from "@/lib/sitio";

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
      demo: true,
      propiedad: { select: { nombre: true, slug: true, urlMapa: true, ...SELECT_PUBLICACION } },
      tarifas: { select: { precioNoche: true } },
    },
  });
  if (!cabana) return null;

  const { tarifas, ...resto } = cabana;
  return {
    ...resto,
    precioDesde: precioDesde(tarifas),
    galeria: galeriaDeCabana({ ...cabana, propiedadSlug: cabana.propiedad.slug }),
    pendientes: datosPendientes(cabana.propiedad),
    bloqueo: bloqueoPublicacion(cabana.propiedad, enModoPrueba()),
  };
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
      urlMapa: true,
      ...SELECT_PUBLICACION,
      cabanas: {
        where: { activa: true },
        orderBy: { createdAt: "asc" },
        select: {
          nombre: true,
          slug: true,
          capacidad: true,
          dormitorios: true,
          fotos: true,
          demo: true,
          tarifas: { select: { precioNoche: true } },
        },
      },
    },
  });
  if (!propiedad) return null;

  const cabanas = propiedad.cabanas.map(({ tarifas, ...c }) => ({ ...c, precioDesde: precioDesde(tarifas) }));
  const precios = cabanas.map((c) => c.precioDesde).filter((p): p is number => p !== null);
  return {
    ...propiedad,
    cabanas,
    precioDesde: precios.length ? Math.min(...precios) : null,
    pendientes: datosPendientes(propiedad),
    bloqueo: bloqueoPublicacion(propiedad, enModoPrueba()),
  };
});

export type PropiedadPublica = NonNullable<Awaited<ReturnType<typeof obtenerPropiedadPublica>>>;
