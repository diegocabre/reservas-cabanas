import Image from "next/image";
import Link from "next/link";
import { EtiquetaDemo } from "@/components/aviso-prueba";
import { IconoFlecha, IconoPersonas, IconoUbicacion } from "@/components/iconos";
import { PerfilVolcan } from "@/components/perfil-volcan";
import type { PropiedadEnDirectorio } from "@/lib/cabanas";
import { destinoPropiedad } from "@/lib/directorio";
import { formatearCLP } from "@/lib/formato";

/** Tarjeta de una propiedad en la portada: toda la tarjeta es el enlace. */
export function TarjetaPropiedad({ propiedad, destacada = false }: { propiedad: PropiedadEnDirectorio; destacada?: boolean }) {
  const n = propiedad.cabanas.length;
  const demo = propiedad.cabanas.every((c) => c.demo);

  return (
    <Link
      href={destinoPropiedad(propiedad)}
      className="group block overflow-hidden rounded-3xl border border-linea bg-nieve shadow-[0_18px_40px_-28px_var(--madera)] transition-shadow hover:shadow-[0_24px_50px_-24px_var(--madera)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lago"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-papel-hondo">
        {propiedad.foto ? (
          <Image
            src={propiedad.foto}
            alt={propiedad.nombre}
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
        {demo && <EtiquetaDemo className="absolute top-3 left-3" />}
      </div>

      <div className="vetas p-5">
        <h2 className="font-display text-2xl leading-tight font-semibold text-tinta">{propiedad.nombre}</h2>

        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-tinta-suave">
          {propiedad.ubicacion && (
            <li className="flex items-center gap-1.5">
              <IconoUbicacion className="size-4 text-lago" />
              <span>{propiedad.ubicacion}</span>
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <IconoPersonas className="size-4 text-lago" />
            <span>
              {n === 1 ? "1 cabaña" : `${n} cabañas`}, hasta {propiedad.capacidadMaxima} personas
            </span>
          </li>
        </ul>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-linea pt-4">
          {propiedad.precioDesde !== null ? (
            <p className="leading-tight">
              <span className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Desde </span>
              <span className="font-display text-xl font-semibold text-tinta">{formatearCLP(propiedad.precioDesde)}</span>
              <span className="text-sm text-tinta-suave"> por noche</span>
            </p>
          ) : (
            <p className="text-sm text-tinta-suave">Consulta fechas y precios</p>
          )}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fuego text-nieve transition-colors group-hover:bg-fuego-hondo">
            <IconoFlecha className="size-4" />
            <span className="sr-only">{n === 1 ? "Ver la cabaña" : "Ver las cabañas"}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
