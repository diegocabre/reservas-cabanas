import Image from "next/image";
import { PerfilVolcan } from "@/components/perfil-volcan";

/** Ubicación de cada foto en la grilla de escritorio (4×2), sin huecos con 1 a 5+ fotos. */
function claseEscritorio(i: number, total: number): string {
  if (i === 0) return total === 1 ? "md:col-span-4 md:row-span-2" : "md:col-span-2 md:row-span-2";
  if (i > 4) return "md:hidden";
  if (total === 2) return "md:col-span-2 md:row-span-2";
  if (total === 3) return "md:col-span-2";
  if (total === 4 && i === 3) return "md:col-span-2";
  return "";
}

/**
 * Galería sin JavaScript:
 * - Celular: carrusel horizontal con scroll-snap, fotos a todo el ancho y contador por foto.
 * - Escritorio (md+): grilla con una foto grande y hasta cuatro chicas.
 */
export function Galeria({ fotos, nombre }: { fotos: string[]; nombre: string }) {
  if (fotos.length === 0) {
    return (
      <div className="vetas flex aspect-[4/3] items-end justify-center bg-papel-hondo md:aspect-[21/9] md:rounded-3xl">
        <PerfilVolcan className="w-2/3 max-w-md" />
      </div>
    );
  }

  return (
    <div
      className="sin-scrollbar flex snap-x snap-mandatory overflow-x-auto md:grid md:aspect-[2/1] md:snap-none md:grid-cols-4 md:grid-rows-2 md:gap-2 md:overflow-hidden md:rounded-3xl"
      aria-label={`Fotos de ${nombre}`}
    >
      {fotos.map((foto, i) => (
        <figure
          key={foto}
          className={`relative aspect-[4/3] w-full shrink-0 snap-center md:aspect-auto ${claseEscritorio(i, fotos.length)}`}
        >
          <Image
            src={foto}
            alt={`${nombre}, foto ${i + 1} de ${fotos.length}`}
            fill
            sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 100vw"}
            className="object-cover"
            {...(i === 0 ? { fetchPriority: "high" as const, loading: "eager" as const } : {})}
          />
          {fotos.length > 1 && (
            <figcaption className="absolute right-3 bottom-3 rounded-full bg-tinta/60 px-2.5 py-1 text-xs font-semibold text-nieve backdrop-blur-sm md:hidden">
              {i + 1} / {fotos.length}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
