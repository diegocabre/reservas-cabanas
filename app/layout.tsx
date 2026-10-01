import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { urlDelSitio } from "@/lib/sitio";
import "./globals.css";

const titulo = Fraunces({
  variable: "--font-titulo",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

const texto = Nunito_Sans({
  variable: "--font-texto",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: urlDelSitio(),
  title: "Reservas Cabañas Sur",
  description: "Reserva directa de cabañas en el sur de Chile.",
};

export const viewport: Viewport = {
  themeColor: "#f6f0e6",
  // Necesario para que env(safe-area-inset-*) funcione en iPhone.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CL" className={`${titulo.variable} ${texto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
