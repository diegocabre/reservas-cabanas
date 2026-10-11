import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AvisoPendientes, BloqueoPublicacion, EtiquetaDemo } from "@/components/aviso-prueba";
import { Galeria } from "@/components/cabana/galeria";
import { BotonDisponibilidad, PrecioDesde } from "@/components/cabana/precio-desde";
import Link from "next/link";
import { IconoCama, IconoFlecha, IconoHoja, IconoPersonas } from "@/components/iconos";
import { EnlaceMiReserva } from "@/components/enlace-mi-reserva";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { Ubicacion } from "@/components/ubicacion";
import { obtenerCabanaPublica } from "@/lib/cabanas";
import { imagenParaCompartir } from "@/lib/fotos";
import { enModoPrueba } from "@/lib/sitio";
import { formatearCLP } from "@/lib/formato";

// Cada cabaña se renderiza en su primera visita, queda en caché y se regenera cada 5 minutos
// (así el precio "desde" sigue a las tarifas y un peak desde Instagram no golpea la base).
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

type Props = PageProps<"/[propiedad]/[cabana]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { propiedad, cabana: slug } = await params;
  const cabana = await obtenerCabanaPublica(propiedad, slug);
  if (!cabana) return { title: "Cabaña no encontrada" };

  const titulo = `${cabana.nombre} · ${cabana.propiedad.nombre}`;
  const resumen = [
    cabana.propiedad.ubicacion,
    `${cabana.capacidad} personas`,
    `${cabana.dormitorios} ${cabana.dormitorios === 1 ? "dormitorio" : "dormitorios"}`,
    cabana.precioDesde !== null ? `desde ${formatearCLP(cabana.precioDesde)} por noche` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const descripcion = `${resumen}. ${cabana.descripcion}`.slice(0, 200);
  const ruta = `/${cabana.propiedad.slug}/${cabana.slug}`;
  // Vista previa en WhatsApp: la imagen del ítem 1 de la galería (foto o poster del video).
  const portada = cabana.galeria[0];
  const imagen = portada ? [imagenParaCompartir(portada.imagen, portada.alt)] : undefined;

  return {
    title: titulo,
    description: descripcion,
    // Bloqueada por datos PENDIENTE: que no la indexen.
    ...(cabana.bloqueo ? { robots: { index: false } } : {}),
    alternates: { canonical: ruta },
    openGraph: {
      type: "website",
      locale: "es_CL",
      siteName: cabana.propiedad.nombre,
      url: ruta,
      title: titulo,
      description: descripcion,
      images: imagen,
    },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion, images: imagen?.map((i) => i.url) },
  };
}

export default async function PaginaCabana({ params }: Props) {
  const { propiedad, cabana: slug } = await params;
  const cabana = await obtenerCabanaPublica(propiedad, slug);
  if (!cabana) notFound();

  const urlReserva = `/reservar/${cabana.propiedad.slug}/${cabana.slug}`;
  const prueba = enModoPrueba();

  return (
    <main className="flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-20">
      <div className="relative md:mx-auto md:max-w-6xl md:px-6 md:pt-6">
        <Galeria
          medios={cabana.galeria}
          nombre={cabana.nombre}
          vertical={cabana.galeria.some((m) => m.tipo === "video")}
        />
        <Link
          href={cabana.volver.href}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-nieve/90 px-3.5 py-2 text-sm font-semibold text-tinta shadow-sm backdrop-blur-sm transition-colors hover:bg-nieve md:top-9 md:left-9"
        >
          <IconoFlecha className="size-4 rotate-180" />
          {cabana.volver.texto}
        </Link>
      </div>

      <div className="mx-auto max-w-6xl px-5 pt-6 md:grid md:grid-cols-[1fr_20rem] md:gap-14 md:px-6 md:pt-10">
        <article>
          {prueba && <AvisoPendientes pendientes={cabana.pendientes} className="mb-4" />}
          <p className="text-xs font-bold tracking-[0.18em] text-madera uppercase">
            {cabana.propiedad.nombre} {cabana.demo && <EtiquetaDemo className="ml-1 align-middle" />}
          </p>
          <Ubicacion texto={cabana.propiedad.ubicacion} urlMapa={cabana.propiedad.urlMapa} className="mt-1" />
          <h1 className="mt-2 font-display text-[2.1rem] leading-[1.05] font-semibold text-balance text-tinta md:text-5xl">
            {cabana.nombre}
          </h1>

          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-tinta">
            <li className="flex items-center gap-2">
              <IconoPersonas className="size-5 text-lago" />
              <span>
                Hasta <strong className="font-bold">{cabana.capacidad}</strong> personas
              </span>
            </li>
            <li className="flex items-center gap-2">
              <IconoCama className="size-5 text-lago" />
              <span>
                <strong className="font-bold">{cabana.dormitorios}</strong>{" "}
                {cabana.dormitorios === 1 ? "dormitorio" : "dormitorios"}
              </span>
            </li>
          </ul>

          <PerfilVolcan className="my-8 h-10 w-full" />

          {cabana.servicios.length > 0 && (
            <section aria-labelledby="titulo-servicios">
              <h2 id="titulo-servicios" className="font-display text-xl font-semibold text-tinta">
                Lo que encontrarás
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {cabana.servicios.map((servicio) => (
                  <li
                    key={servicio}
                    className="inline-flex items-center gap-1.5 rounded-full border border-madera/20 bg-papel-hondo px-3.5 py-1.5 text-sm font-semibold text-tinta"
                  >
                    <IconoHoja className="size-3.5 text-musgo" />
                    {servicio}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {cabana.descripcion && (
            <section aria-labelledby="titulo-descripcion" className="mt-10">
              <h2 id="titulo-descripcion" className="font-display text-xl font-semibold text-tinta">
                La cabaña
              </h2>
              <p className="mt-3 max-w-prose text-[1.0625rem] leading-relaxed whitespace-pre-line text-tinta/90">
                {cabana.descripcion}
              </p>
            </section>
          )}
          <EnlaceMiReserva className="mt-10" />
        </article>

        {/* Escritorio: tarjeta lateral fija al hacer scroll. */}
        <aside className="hidden md:block">
          <div className="vetas sticky top-6 rounded-3xl border border-linea bg-nieve p-6 shadow-[0_20px_50px_-30px_var(--madera)]">
            {cabana.bloqueo ? (
              <BloqueoPublicacion mensaje={cabana.bloqueo} className="border-0 p-0" />
            ) : (
              <>
                <PrecioDesde precio={cabana.precioDesde} />
                <BotonDisponibilidad href={urlReserva} prueba={prueba} className="mt-5 w-full" />
                <p className="mt-3 text-center text-xs text-tinta-suave">Reserva directa con la cabaña, sin comisiones.</p>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Celular: barra fija abajo, respetando la barra de inicio del iPhone. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-linea bg-nieve/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        {cabana.bloqueo ? (
          <p className="mx-auto max-w-xl text-center text-sm text-tinta-suave">{cabana.bloqueo}</p>
        ) : (
          <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
            <PrecioDesde precio={cabana.precioDesde} />
            <BotonDisponibilidad href={urlReserva} prueba={prueba} className="shrink-0" />
          </div>
        )}
      </div>
    </main>
  );
}
