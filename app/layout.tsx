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
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <footer className="mt-auto px-4 py-6 text-center text-xs text-tinta-suave">
          Desarrollado por{" "}
          <a href="https://diegocabre.vercel.app" target="_blank" rel="nofollow noopener" className="whitespace-nowrap underline decoration-tinta-suave/30 underline-offset-4 hover:decoration-tinta-suave">
            Diego Cabré<span className="sr-only"> (abre en otra pestaña)</span>
          </a>{" "}
          ·{" "}
          <a href="https://www.solucionesdys.cl" target="_blank" rel="nofollow noopener" className="whitespace-nowrap underline decoration-tinta-suave/30 underline-offset-4 hover:decoration-tinta-suave">
            Soluciones DyS<span className="sr-only"> (abre en otra pestaña)</span>
          </a>
        </footer>
      </body>
    </html>
  );
}
