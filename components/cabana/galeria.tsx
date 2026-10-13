import Image from "next/image";
import { PerfilVolcan } from "@/components/perfil-volcan";
import type { MedioGaleria } from "@/lib/galeria";
import { Carrusel } from "./carrusel";

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
 * Galería de la cabaña. El primer medio es la portada.
 * - Fotos horizontales: carrusel en el celular y grilla con una foto grande en escritorio.
 * - Con videos o medios verticales (grabados con el celular): carrusel vertical 3:4 en el celular
 *   y fila de cuatro con flechas en escritorio, sin recortar el formato.
 * Videos: poster, preload="metadata", muted y playsInline (en iPhone no abre pantalla completa).
 * Imágenes: la portada con prioridad; el resto con lazy loading.
 */
export function Galeria({ medios, nombre, vertical = false }: { medios: MedioGaleria[]; nombre: string; vertical?: boolean }) {
  if (medios.length === 0) {
    return (
      <div className="vetas flex aspect-[4/3] items-end justify-center bg-papel-hondo md:aspect-[21/9] md:rounded-3xl">
        <PerfilVolcan className="w-2/3 max-w-md" />
      </div>
    );
  }

  if (vertical) {
    return (
      <Carrusel
        etiqueta={`Fotos y videos de ${nombre}`}
        className="sin-scrollbar flex snap-x snap-mandatory gap-1 overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-lago md:gap-3 md:rounded-3xl"
      >
        {medios.map((medio, i) => (
          <figure
            key={medio.src}
            className="relative aspect-[3/4] w-full shrink-0 snap-center overflow-hidden bg-tinta md:w-[calc((100%-2.25rem)/4)] md:snap-start md:rounded-2xl"
          >
            <Medio medio={medio} portada={i === 0} sizes="(min-width: 768px) 25vw, 100vw" />
            <Contador i={i} total={medios.length} />
          </figure>
        ))}
      </Carrusel>
    );
  }

  return (
    <div
      className="sin-scrollbar flex snap-x snap-mandatory overflow-x-auto md:grid md:aspect-[2/1] md:snap-none md:grid-cols-4 md:grid-rows-2 md:gap-2 md:overflow-hidden md:rounded-3xl"
      aria-label={`Fotos de ${nombre}`}
    >
      {medios.map((medio, i) => (
        <figure
          key={medio.src}
          className={`relative aspect-[4/3] w-full shrink-0 snap-center md:aspect-auto ${claseEscritorio(i, medios.length)}`}
        >
          <Medio
            medio={medio}
            portada={i === 0}
            sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 100vw"}
          />
          <Contador i={i} total={medios.length} className="md:hidden" />
        </figure>
      ))}
    </div>
  );
}

function Medio({ medio, portada, sizes }: { medio: MedioGaleria; portada: boolean; sizes: string }) {
  if (medio.tipo === "video") {
    return (
      <video
        src={medio.src}
        poster={medio.imagen}
        preload="metadata"
        muted
        playsInline
        controls
        loop
        aria-label={medio.alt}
        className="absolute inset-0 size-full object-cover"
      />
    );
  }
  return (
    <Image
      src={medio.src}
      alt={medio.alt}
      fill
      sizes={sizes}
      className="object-cover"
      {...(portada ? { fetchPriority: "high" as const, loading: "eager" as const } : { loading: "lazy" as const })}
    />
  );
}

function Contador({ i, total, className = "" }: { i: number; total: number; className?: string }) {
  if (total < 2) return null;
  return (
    <figcaption
      className={`pointer-events-none absolute top-3 right-3 rounded-full bg-tinta/60 px-2.5 py-1 text-xs font-semibold text-nieve backdrop-blur-sm ${className}`}
    >
      {i + 1} / {total}
    </figcaption>
  );
}
