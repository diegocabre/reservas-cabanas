import type { Metadata } from "next";
import { obtenerAdmin, requerirSuperadmin } from "@/lib/admin";
import { cerrarSesion } from "../acciones";
import { EnlacePanel } from "../(panel)/enlace-panel";

export const metadata: Metadata = {
  title: { default: "Plataforma", template: "%s · Plataforma" },
  robots: { index: false },
};

/** Páginas de Soluciones DyS (superadmin). No exigen administrar una propiedad: 404 para el resto. */
export default async function LayoutPlataforma({ children }: LayoutProps<"/admin">) {
  const sa = await requerirSuperadmin();
  const admin = await obtenerAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-linea bg-nieve">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-2">
          <nav aria-label="Plataforma" className="-ml-2 flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none]">
            <EnlacePanel href="/admin/plataforma">Plataforma</EnlacePanel>
            <EnlacePanel href="/admin/moderacion">Moderación</EnlacePanel>
            {admin && <EnlacePanel href="/admin">Mi panel</EnlacePanel>}
          </nav>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden min-w-0 truncate text-sm text-tinta-suave sm:block">{sa.email}</span>
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
