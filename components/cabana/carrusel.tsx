"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconoFlecha } from "@/components/iconos";

/**
 * Fila desplazable con flechas anterior/siguiente en escritorio, donde no hay gesto de deslizar
 * y la barra de desplazamiento está oculta. En el celular se desliza con el dedo.
 * Cada flecha avanza un medio; se desactiva al llegar al borde.
 */
export function Carrusel({ etiqueta, className, children }: { etiqueta: string; className: string; children: ReactNode }) {
  const fila = useRef<HTMLDivElement>(null);
  const [bordes, setBordes] = useState({ inicio: true, fin: true });

  useEffect(() => {
    const el = fila.current;
    if (!el) return;
    const medir = () =>
      setBordes({ inicio: el.scrollLeft <= 1, fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, []);

  function mover(sentido: 1 | -1) {
    const el = fila.current;
    const medio = el?.firstElementChild as HTMLElement | null;
    if (!el || !medio) return;
    const paso = medio.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    el.scrollBy({ left: sentido * paso, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div ref={fila} className={className} aria-label={etiqueta} role="region" tabIndex={0}>
        {children}
      </div>
      <Flecha sentido={-1} desactivada={bordes.inicio} onClick={() => mover(-1)} />
      <Flecha sentido={1} desactivada={bordes.fin} onClick={() => mover(1)} />
    </div>
  );
}

function Flecha({ sentido, desactivada, onClick }: { sentido: 1 | -1; desactivada: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactivada}
      aria-label={sentido === 1 ? "Ver siguiente" : "Ver anterior"}
      className={`absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-nieve/90 text-tinta shadow-md backdrop-blur-sm transition-[opacity,transform,background-color] duration-200 ease-out hover:bg-nieve active:scale-95 disabled:pointer-events-none disabled:opacity-0 md:flex ${
        sentido === 1 ? "-right-5" : "-left-5"
      }`}
    >
      <IconoFlecha className={`size-5 ${sentido === 1 ? "" : "rotate-180"}`} />
    </button>
  );
}
