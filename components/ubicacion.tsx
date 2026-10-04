import { IconoUbicacion } from "@/components/iconos";

/** Ubicación de la propiedad con link opcional a Google Maps (abre en otra pestaña). */
export function Ubicacion({
  texto,
  urlMapa,
  className = "",
}: {
  texto: string | null;
  urlMapa: string | null;
  className?: string;
}) {
  if (!texto && !urlMapa) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-tinta-suave ${className}`}>
      <IconoUbicacion className="size-4 shrink-0 text-madera" />
      {texto && <span>{texto}</span>}
      {urlMapa && (
        <>
          {texto && <span aria-hidden="true">·</span>}
          <a
            href={urlMapa}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-lago underline decoration-lago/30 underline-offset-4 hover:decoration-lago"
          >
            Ver en el mapa
          </a>
        </>
      )}
    </p>
  );
}
