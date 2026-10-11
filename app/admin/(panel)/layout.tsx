import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/admin";
import { cerrarSesion } from "../acciones";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel" },
  robots: { index: false },
};

// Base mínima del panel: las pantallas llegan en las próximas tareas.
export default async function LayoutPanel({ children }: LayoutProps<"/admin">) {
  // Protege las páginas del panel. Las Server Actions llaman a requerirAdmin() por su cuenta.
  const admin = await requerirAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-linea bg-nieve">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <span className="min-w-0 truncate text-sm text-tinta-suave">{admin.email}</span>
          <form action={cerrarSesion}>
            <button type="submit" className="min-h-11 rounded-full px-4 text-sm font-semibold text-tinta-suave hover:bg-papel-hondo hover:text-tinta">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-16">{children}</main>
    </div>
  );
}
