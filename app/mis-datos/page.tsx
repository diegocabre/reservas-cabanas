import type { Metadata } from "next";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { FormularioPedirAcceso } from "./formularios";

export const metadata: Metadata = {
  title: "Mis datos",
  description: "Mira la información que guardamos sobre ti y las reseñas de tus estadías, y pide corregirla o eliminarla.",
  robots: { index: false },
};

export default function PaginaMisDatos() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pt-12 pb-16">
      <div className="text-center">
        <PerfilVolcan className="mx-auto h-10 w-48" />
        <h1 className="mt-5 font-display text-3xl font-semibold text-balance">Mis datos</h1>
        <p className="mt-2 text-tinta-suave">
          Te enviamos un link a tu correo para ver lo que guardamos sobre ti y las reseñas que los anfitriones escribieron sobre
          tus estadías. Desde ahí puedes responderlas o pedir que corrijamos o eliminemos tu información.
        </p>
      </div>
      <div className="vetas mt-8 rounded-3xl border border-linea bg-nieve p-5">
        <FormularioPedirAcceso />
      </div>
    </main>
  );
}
