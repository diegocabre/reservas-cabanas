import type { Metadata } from "next";
import { EnlaceMiReserva } from "@/components/enlace-mi-reserva";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { TarjetaPropiedad } from "@/components/tarjeta-propiedad";
import { obtenerDirectorio } from "@/lib/cabanas";

// Portada: directorio de todas las propiedades publicadas. Cada tarjeta lleva a la cabaña del
// dueño (si tiene una) o a la lista de sus cabañas. Se regenera cada 5 minutos, como las demás.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Reservas Cabañas Sur",
  description: "Cabañas del sur de Chile con reserva directa: eliges la cabaña, pagas el abono y tratas con su dueño.",
  alternates: { canonical: "/" },
};

/** Grilla centrada: con pocas propiedades no quedan columnas vacías en escritorio. */
function columnas(total: number): string {
  if (total === 1) return "max-w-md";
  if (total === 2) return "max-w-4xl sm:grid-cols-2";
  return "sm:grid-cols-2 lg:grid-cols-3";
}

export default async function Inicio() {
  const propiedades = await obtenerDirectorio();

  return (
    <main className="flex-1 pb-16">
      <header className="mx-auto max-w-6xl px-5 pt-10 pb-8 text-center md:px-6 md:pt-16 md:pb-12">
        <PerfilVolcan className="mx-auto h-12 w-60 md:h-14 md:w-72" />
        <h1 className="mt-5 font-display text-[2.4rem] leading-[1.05] font-semibold text-balance text-tinta md:text-6xl">
          Reservas Cabañas Sur
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-tinta-suave md:text-lg">
          Cabañas del sur de Chile con reserva directa: eliges la cabaña, pagas el abono y tratas con su dueño.
        </p>
      </header>

      <section aria-label="Cabañas" className="mx-auto max-w-6xl px-5 md:px-6">
        {propiedades.length === 0 ? (
          <p className="text-center text-tinta-suave">Pronto vas a encontrar aquí las primeras cabañas.</p>
        ) : (
          <ul className={`mx-auto grid gap-6 ${columnas(propiedades.length)}`}>
            {propiedades.map((p, i) => (
              <li key={p.slug}>
                <TarjetaPropiedad propiedad={p} destacada={i === 0} />
              </li>
            ))}
          </ul>
        )}
        <EnlaceMiReserva className="mt-10 text-center" />
      </section>
    </main>
  );
}
