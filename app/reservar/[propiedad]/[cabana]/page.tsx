import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoPrueba } from "@/components/aviso-prueba";
import { IconoFlecha } from "@/components/iconos";
import { enModoPrueba } from "@/lib/sitio";
import { FormularioReserva } from "@/components/reserva/formulario-reserva";
import { obtenerDatosReserva } from "@/lib/reservas";

export const metadata: Metadata = {
  title: "Reservar",
  robots: { index: false },
};

// Sin caché: la disponibilidad cambia con cada reserva.
export default async function PaginaReservar({ params }: PageProps<"/reservar/[propiedad]/[cabana]">) {
  const { propiedad, cabana: slug } = await params;
  const datos = await obtenerDatosReserva(propiedad, slug);
  if (!datos) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-10 md:px-6 md:pt-8">
      <Link
        href={`/${datos.propiedad.slug}/${datos.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-lago"
      >
        <IconoFlecha className="size-4 rotate-180" />
        Volver a la cabaña
      </Link>

      <header className="mt-4 mb-6 flex items-center gap-4">
        {datos.fotos[0] && (
          <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl md:size-20">
            <Image src={datos.fotos[0]} alt="" fill sizes="80px" className="object-cover" />
          </div>
        )}
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-madera uppercase">{datos.propiedad.nombre}</p>
          <h1 className="font-display text-2xl leading-tight font-semibold md:text-3xl">Reserva en {datos.nombre}</h1>
        </div>
      </header>

      {enModoPrueba() && <AvisoPrueba className="mb-6" />}

      <FormularioReserva datos={datos} modoPrueba={enModoPrueba()} />
    </main>
  );
}
