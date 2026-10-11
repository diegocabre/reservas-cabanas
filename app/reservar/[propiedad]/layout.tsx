import type { Viewport } from "next";
import { TemaPropiedad } from "@/components/tema-propiedad";
import { obtenerTemaPropiedad } from "@/lib/cabanas";
import { coloresDe } from "@/lib/tema";

// Calendario y datos del huésped: con los colores del dueño, igual que la página de la cabaña.

export async function generateViewport({ params }: LayoutProps<"/reservar/[propiedad]">): Promise<Viewport> {
  const { propiedad } = await params;
  return { themeColor: coloresDe(await obtenerTemaPropiedad(propiedad)).papel, viewportFit: "cover" };
}

export default async function LayoutReservar({ children, params }: LayoutProps<"/reservar/[propiedad]">) {
  const { propiedad } = await params;
  return <TemaPropiedad tema={await obtenerTemaPropiedad(propiedad)}>{children}</TemaPropiedad>;
}
