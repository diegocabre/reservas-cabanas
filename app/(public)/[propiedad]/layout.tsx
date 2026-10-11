import type { Viewport } from "next";
import { TemaPropiedad } from "@/components/tema-propiedad";
import { obtenerTemaPropiedad } from "@/lib/cabanas";
import { coloresDe } from "@/lib/tema";

// Páginas de la propiedad y de sus cabañas: con los colores del dueño.

export async function generateViewport({ params }: LayoutProps<"/[propiedad]">): Promise<Viewport> {
  const { propiedad } = await params;
  // Barra del navegador en el celular, del mismo color que el fondo de la propiedad.
  return { themeColor: coloresDe(await obtenerTemaPropiedad(propiedad)).papel, viewportFit: "cover" };
}

export default async function LayoutPropiedad({ children, params }: LayoutProps<"/[propiedad]">) {
  const { propiedad } = await params;
  return <TemaPropiedad tema={await obtenerTemaPropiedad(propiedad)}>{children}</TemaPropiedad>;
}
