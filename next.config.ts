import type { NextConfig } from "next";
import { cabecerasDeSeguridad } from "./lib/cabeceras";

const nextConfig: NextConfig = {
  // Sin el botón flotante de Next en desarrollo (tapa la barra de reserva al grabar la pantalla).
  devIndicators: false,
  // Cabeceras de seguridad (lib/cabeceras.ts).
  headers: async () => cabecerasDeSeguridad(),
  images: {
    // Fotos de ejemplo del seed. Cuando las propiedades suban sus fotos, agregar aquí el host de Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" }],
  },
};

export default nextConfig;
