import type { Metadata } from "next";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { FormularioBusqueda } from "./formulario-busqueda";

export const metadata: Metadata = {
  title: "Buscar mi reserva",
  description: "Vuelve a tu reserva con tu código y tu email para pagar el abono o ver el estado.",
  robots: { index: false },
};

export default function PaginaMiReserva() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pt-12 pb-16">
      <div className="text-center">
        <PerfilVolcan className="mx-auto h-10 w-48" />
        <h1 className="mt-5 font-display text-3xl font-semibold text-balance">Buscar mi reserva</h1>
        <p className="mt-2 text-tinta-suave">
          Escribe el código que te enviamos por email y el email con el que reservaste.
        </p>
      </div>
      <div className="vetas mt-8 rounded-3xl border border-linea bg-nieve p-5">
        <FormularioBusqueda />
      </div>
    </main>
  );
}
