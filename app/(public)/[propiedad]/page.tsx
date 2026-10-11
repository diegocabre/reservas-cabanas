import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoPendientes, BloqueoPublicacion } from "@/components/aviso-prueba";
import { TarjetaCabana } from "@/components/cabana/tarjeta-cabana";
import { EnlaceMiReserva } from "@/components/enlace-mi-reserva";
import { IconoFlecha } from "@/components/iconos";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { Ubicacion } from "@/components/ubicacion";
import { obtenerPropiedadPublica } from "@/lib/cabanas";
import { imagenParaCompartir } from "@/lib/fotos";
import { formatearCLP } from "@/lib/formato";
import { enModoPrueba } from "@/lib/sitio";

// Igual que la página de la cabaña: se genera en la primera visita y se regenera cada 5 minutos.
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

type Props = PageProps<"/[propiedad]">;

/** Grilla centrada: con pocas cabañas no quedan columnas vacías en escritorio. */
function columnas(total: number): string {
  if (total === 1) return "max-w-md";
  if (total === 2) return "max-w-4xl sm:grid-cols-2";
  return "sm:grid-cols-2 lg:grid-cols-3";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { propiedad: slug } = await params;
  const propiedad = await obtenerPropiedadPublica(slug);
  if (!propiedad) return { title: "Propiedad no encontrada" };

  const n = propiedad.cabanas.length;
  const descripcion = [
    propiedad.ubicacion,
    `${n} ${n === 1 ? "cabaña" : "cabañas"}`,
    propiedad.precioDesde !== null ? `desde ${formatearCLP(propiedad.precioDesde)} por noche` : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .concat(". Reserva directa.");
  const ruta = `/${propiedad.slug}`;
  const portada = propiedad.cabanas.find((c) => c.fotos[0])?.fotos[0];
  const imagen = portada ? [imagenParaCompartir(portada, propiedad.nombre)] : undefined;

  return {
    title: propiedad.nombre,
    description: descripcion,
    ...(propiedad.bloqueo ? { robots: { index: false } } : {}),
    alternates: { canonical: ruta },
    openGraph: {
      type: "website",
      locale: "es_CL",
      siteName: propiedad.nombre,
      url: ruta,
      title: propiedad.nombre,
      description: descripcion,
      images: imagen,
    },
    twitter: { card: "summary_large_image", title: propiedad.nombre, description: descripcion, images: imagen?.map((i) => i.url) },
  };
}

export default async function PaginaPropiedad({ params }: Props) {
  const { propiedad: slug } = await params;
  const propiedad = await obtenerPropiedadPublica(slug);
  if (!propiedad) notFound();

  return (
    <main className="flex-1 pb-16">
      <header className="relative mx-auto max-w-6xl px-5 pt-14 pb-8 text-center md:px-6 md:pt-16 md:pb-12">
        <Link
          href="/"
          className="absolute top-3 left-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-tinta-suave transition-colors hover:text-tinta md:left-6"
        >
          <IconoFlecha className="size-4 rotate-180" />
          Todas las cabañas
        </Link>
        <PerfilVolcan className="mx-auto h-12 w-60 md:h-14 md:w-72" />
        <h1 className="mt-5 font-display text-[2.4rem] leading-[1.05] font-semibold text-balance text-tinta md:text-6xl">
          {propiedad.nombre}
        </h1>
        <Ubicacion
          texto={propiedad.ubicacion}
          urlMapa={propiedad.urlMapa}
          className="mt-3 justify-center text-base"
        />
      </header>

      <section aria-label="Cabañas" className="mx-auto max-w-6xl px-5 md:px-6">
        {enModoPrueba() && <AvisoPendientes pendientes={propiedad.pendientes} className="mx-auto mb-6 max-w-md" />}
        {propiedad.bloqueo ? (
          <BloqueoPublicacion mensaje={propiedad.bloqueo} className="mx-auto max-w-md" />
        ) : propiedad.cabanas.length === 0 ? (
          <p className="text-center text-tinta-suave">Por ahora no hay cabañas publicadas.</p>
        ) : (
          <ul className={`mx-auto grid gap-6 ${columnas(propiedad.cabanas.length)}`}>
            {propiedad.cabanas.map((cabana, i) => (
              <li key={cabana.slug}>
                <TarjetaCabana cabana={cabana} href={`/${propiedad.slug}/${cabana.slug}`} destacada={i === 0} />
              </li>
            ))}
          </ul>
        )}
        <EnlaceMiReserva className="mt-10 text-center" />
      </section>
    </main>
  );
}
