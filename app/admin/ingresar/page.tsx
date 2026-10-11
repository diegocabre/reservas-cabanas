import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { mensajeIngreso } from "@/lib/acceso";
import { obtenerAdmin } from "@/lib/admin";
import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = {
  title: "Ingresar al panel",
  robots: { index: false },
};

export default async function PaginaIngresar({ searchParams }: PageProps<"/admin/ingresar">) {
  if (await obtenerAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pt-12 pb-16">
      <div className="text-center">
        <PerfilVolcan className="mx-auto h-10 w-48" />
        <h1 className="mt-5 font-display text-3xl font-semibold text-balance">Panel de tu cabaña</h1>
        <p className="mt-2 text-tinta-suave">Te enviamos un link a tu email para entrar, sin contraseña.</p>
      </div>
      <div className="vetas mt-8 rounded-3xl border border-linea bg-nieve p-5">
        <FormularioIngreso errorInicial={mensajeIngreso(typeof error === "string" ? error : undefined)} />
      </div>
    </main>
  );
}
