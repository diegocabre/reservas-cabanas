import Image from "next/image";
import Link from "next/link";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { IconoCama, IconoFlecha, IconoPersonas } from "@/components/iconos";
import { formatearCLP } from "@/lib/formato";
import type { PropiedadPublica } from "@/lib/cabanas";

type Props = {
  cabana: PropiedadPublica["cabanas"][number];
  href: string;
  /** La primera tarjeta carga su foto con prioridad (es lo primero que se ve). */
  destacada?: boolean;
};

/** Tarjeta de cabaña: toda la tarjeta es el enlace, no solo el nombre. */
export function TarjetaCabana({ cabana, href, destacada = false }: Props) {
  const foto = cabana.fotos[0];

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-3xl border border-linea bg-nieve shadow-[0_18px_40px_-28px_var(--madera)] transition-shadow hover:shadow-[0_24px_50px_-24px_var(--madera)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lago"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-papel-hondo">
        {foto ? (
          <Image
            src={foto}
            alt={cabana.nombre}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            {...(destacada ? { fetchPriority: "high" as const, loading: "eager" as const } : {})}
          />
        ) : (
          <div className="vetas flex h-full items-end justify-center">
            <PerfilVolcan className="w-2/3" />
          </div>
        )}
      </div>

      <div className="vetas p-5">
        <h2 className="font-display text-2xl leading-tight font-semibold text-tinta">{cabana.nombre}</h2>

        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-tinta-suave">
          <li className="flex items-center gap-1.5">
            <IconoPersonas className="size-4 text-lago" />
            <span>Hasta {cabana.capacidad} personas</span>
          </li>
          <li className="flex items-center gap-1.5">
            <IconoCama className="size-4 text-lago" />
            <span>
              {cabana.dormitorios} {cabana.dormitorios === 1 ? "dormitorio" : "dormitorios"}
            </span>
          </li>
        </ul>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-linea pt-4">
          {cabana.precioDesde !== null ? (
            <p className="leading-tight">
              <span className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Desde </span>
              <span className="font-display text-xl font-semibold text-tinta">{formatearCLP(cabana.precioDesde)}</span>
              <span className="text-sm text-tinta-suave"> por noche</span>
            </p>
          ) : (
            <p className="text-sm text-tinta-suave">Consulta fechas y precios</p>
          )}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fuego text-nieve transition-colors group-hover:bg-fuego-hondo">
            <IconoFlecha className="size-4" />
            <span className="sr-only">Ver cabaña</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
