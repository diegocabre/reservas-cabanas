import type { Metadata } from "next";
import { obtenerSuperadmin, requerirAdmin } from "@/lib/admin";
import { resenasCabanaActivas } from "@/lib/resenas-reglas";
import { EnlacePanel } from "./enlace-panel";
import { cerrarSesion } from "../acciones";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel" },
  robots: { index: false },
};

// Base mínima del panel: las pantallas llegan en las próximas tareas.
export default async function LayoutPanel({ children }: LayoutProps<"/admin">) {
  // Protege las páginas del panel. Las Server Actions llaman a requerirAdmin() por su cuenta.
  const admin = await requerirAdmin();
  const superadmin = await obtenerSuperadmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-linea bg-nieve">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-2">
          <nav aria-label="Panel" className="-ml-2 flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none]">
            <EnlacePanel href="/admin">Hoy</EnlacePanel>
            <EnlacePanel href="/admin/reservas">Reservas</EnlacePanel>
            <EnlacePanel href="/admin/bloqueos">Bloqueos</EnlacePanel>
            <EnlacePanel href="/admin/cabanas">Cabañas</EnlacePanel>
            <EnlacePanel href="/admin/cobros">Cobros</EnlacePanel>
            {admin.propiedades.some((p) => resenasCabanaActivas(p.resenas)) && <EnlacePanel href="/admin/resenas">Reseñas</EnlacePanel>}
            {superadmin && <EnlacePanel href="/admin/plataforma">Plataforma</EnlacePanel>}
          </nav>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden min-w-0 truncate text-sm text-tinta-suave sm:block">{admin.email}</span>
            <form action={cerrarSesion}>
              <button type="submit" className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-tinta-suave hover:bg-papel-hondo hover:text-tinta">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-16">{children}</main>
    </div>
  );
}
