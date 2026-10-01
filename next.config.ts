import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin el botón flotante de Next en desarrollo (tapa la barra de reserva al grabar la pantalla).
  devIndicators: false,
  images: {
    // Fotos de ejemplo del seed. Cuando las propiedades suban sus fotos, agregar aquí el host de Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" }],
  },
};

export default nextConfig;
