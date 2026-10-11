import type { ReactNode } from "react";
import { estiloTema, type Tema } from "@/lib/tema";

/**
 * Aplica los colores de una propiedad a todo lo que contiene: sobrescribe las variables de
 * app/globals.css en este contenedor, así cada componente usa la paleta del dueño sin cambios.
 * También pinta el fondo, porque el del <body> es el de la paleta base.
 */
export function TemaPropiedad({ tema, children }: { tema: Tema | null; children: ReactNode }) {
  return (
    <div style={estiloTema(tema)} className="flex flex-1 flex-col bg-papel text-tinta">
      {children}
    </div>
  );
}
