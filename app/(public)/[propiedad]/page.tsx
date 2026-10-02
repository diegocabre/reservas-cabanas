import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TarjetaCabana } from "@/components/cabana/tarjeta-cabana";
import { IconoUbicacion } from "@/components/iconos";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { obtenerPropiedadPublica } from "@/lib/cabanas";
import { fotoParaCompartir } from "@/lib/fotos";
import { formatearCLP } from "@/lib/formato";

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
  const imagen = portada
    ? [{ url: fotoParaCompartir(portada), width: 1200, height: 630, alt: propiedad.nombre }]
    : undefined;

  return {
    title: propiedad.nombre,
    description: descripcion,
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
      <header className="mx-auto max-w-6xl px-5 pt-10 pb-8 text-center md:px-6 md:pt-16 md:pb-12">
        <PerfilVolcan className="mx-auto h-12 w-60 md:h-14 md:w-72" />
        <h1 className="mt-5 font-display text-[2.4rem] leading-[1.05] font-semibold text-balance text-tinta md:text-6xl">
          {propiedad.nombre}
        </h1>
        {propiedad.ubicacion && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-tinta-suave">
            <IconoUbicacion className="size-4 shrink-0 text-madera" />
            {propiedad.ubicacion}
          </p>
        )}
      </header>

      <section aria-label="Cabañas" className="mx-auto max-w-6xl px-5 md:px-6">
        {propiedad.cabanas.length === 0 ? (
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
      </section>
    </main>
  );
}
