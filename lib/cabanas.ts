import { cache } from "react";
import { db } from "@/lib/db";
import { galeriaDeCabana } from "@/lib/galeria";
import { precioDesde } from "@/lib/precios";
import { tieneCuentaConectada } from "@/lib/mercadopago-cuentas";
import { bloqueoPublicacion, bloqueoReserva, datosPendientes, MENSAJE_SIN_PAGO_EN_LINEA, SELECT_PUBLICACION } from "@/lib/publicacion";
import { enlaceWhatsapp, mensajeConsultaReserva } from "@/lib/whatsapp";
import { enModoPrueba } from "@/lib/sitio";
import { propiedadesVisibles, volverDesdeCabana } from "@/lib/directorio";
import { leerTema } from "@/lib/tema";

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
      propiedad: {
        select: {
          id: true,
          nombre: true,
          slug: true,
          urlMapa: true,
          ...SELECT_PUBLICACION,
          // Cuántas cabañas lista la propiedad (mismas reglas que su página), para el botón "volver".
          _count: { select: { cabanas: { where: { activa: true, ...(enModoPrueba() ? {} : { demo: false }) } } } },
        },
      },
      tarifas: { select: { precioNoche: true } },
    },
  });
  if (!cabana) return null;

  const { tarifas, ...resto } = cabana;
  // Fuera del modo prueba, sin Mercado Pago conectado no se reserva en línea (lib/publicacion.ts).
  const cuentaConectada = enModoPrueba() || (await tieneCuentaConectada(cabana.propiedad.id));
  const bloqueo = bloqueoReserva(cabana, enModoPrueba(), cuentaConectada);
  return {
    ...resto,
    volver: volverDesdeCabana({ ...cabana.propiedad, cabanasListadas: cabana.propiedad._count.cabanas }),
    precioDesde: precioDesde(tarifas),
    galeria: galeriaDeCabana({ ...cabana, propiedadSlug: cabana.propiedad.slug }),
    pendientes: datosPendientes(cabana.propiedad),
    bloqueo,
    /** Enlace para reservar por WhatsApp cuando la cabaña no recibe reservas en línea; si no, null. */
    reservaWhatsapp:
      bloqueo === MENSAJE_SIN_PAGO_EN_LINEA
        ? enlaceWhatsapp(cabana.propiedad.whatsapp, mensajeConsultaReserva(cabana.nombre))
        : null,
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
        // Fuera del modo prueba las cabañas demo no se listan: no existen.
        where: { activa: true, ...(enModoPrueba() ? {} : { demo: false }) },
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

/**
 * Directorio de la portada: propiedades con sus cabañas listadas (mismas reglas que la página de la
 * propiedad: activas, y sin las demo fuera del modo prueba). Las que no pueden publicarse o no tienen
 * cabañas quedan fuera (lib/directorio.ts).
 */
export const obtenerDirectorio = cache(async () => {
  const propiedades = await db.propiedad.findMany({
    select: {
      nombre: true,
      slug: true,
      ...SELECT_PUBLICACION,
      cabanas: {
        where: { activa: true, ...(enModoPrueba() ? {} : { demo: false }) },
        orderBy: { createdAt: "asc" },
        select: { slug: true, capacidad: true, fotos: true, demo: true, tarifas: { select: { precioNoche: true } } },
      },
    },
  });

  return propiedadesVisibles(
    propiedades.map((p) => {
      const precios = p.cabanas.map((c) => precioDesde(c.tarifas)).filter((x): x is number => x !== null);
      return {
        slug: p.slug,
        nombre: p.nombre,
        ubicacion: p.ubicacion,
        bloqueo: bloqueoPublicacion(p, enModoPrueba()),
        cabanas: p.cabanas.map(({ slug, demo }) => ({ slug, demo })),
        foto: p.cabanas.find((c) => c.fotos[0])?.fotos[0] ?? null,
        capacidadMaxima: Math.max(0, ...p.cabanas.map((c) => c.capacidad)),
        precioDesde: precios.length ? Math.min(...precios) : null,
      };
    }),
  );
});

export type PropiedadEnDirectorio = Awaited<ReturnType<typeof obtenerDirectorio>>[number];

/** Tema visual de una propiedad (lib/tema.ts), o null para la paleta base. */
export const obtenerTemaPropiedad = cache(async (propiedadSlug: string) => {
  const propiedad = await db.propiedad.findUnique({ where: { slug: propiedadSlug }, select: { tema: true } });
  return leerTema(propiedad?.tema);
});
