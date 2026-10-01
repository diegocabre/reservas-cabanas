import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { obtenerCabanaPublica } from "@/lib/cabanas";

// Provisoria: el calendario y el formulario llegan en la semana 2.
export const metadata: Metadata = {
  title: "Reservar",
  robots: { index: false },
};

export default async function PaginaReservar({ params }: PageProps<"/reservar/[propiedad]/[cabana]">) {
  const { propiedad, cabana: slug } = await params;
  const cabana = await obtenerCabanaPublica(propiedad, slug);
  if (!cabana) notFound();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <PerfilVolcan className="h-12 w-56" />
      <p className="mt-6 text-xs font-bold tracking-[0.18em] text-madera uppercase">{cabana.propiedad.nombre}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-balance">{cabana.nombre}</h1>
      <p className="mt-3 max-w-sm text-tinta-suave">Muy pronto podrás ver el calendario y reservar en línea desde aquí.</p>
      <Link
        href={`/${cabana.propiedad.slug}/${cabana.slug}`}
        className="mt-8 font-semibold text-lago underline decoration-lago/30 underline-offset-4 hover:decoration-lago"
      >
        Volver a la cabaña
      </Link>
    </main>
  );
}
