import type { Metadata } from "next";
import Link from "next/link";
import { requerirSuperadmin } from "@/lib/admin";
import { formatearFechaHora, hoyEnChile } from "@/lib/formato";
import { listarPropiedades } from "@/lib/plataforma";
import { BotonSuspension, SelectorResenas } from "./controles";

export const metadata: Metadata = { title: "Propiedades" };

/** Propiedades de la plataforma: activar o suspender según su pago, y qué reseñas tiene cada una. */
export default async function PaginaPlataforma() {
  await requerirSuperadmin();
  const propiedades = await listarPropiedades(hoyEnChile());

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Propiedades</h1>
      <p className="mt-1 text-sm text-tinta-suave">
        Una propiedad suspendida no aparece en el sitio, no recibe reservas y sus administradores no entran al panel. Sus reservas
        se conservan.
      </p>

      <ul className="mt-6 grid gap-4">
        {propiedades.map((p) => (
          <li key={p.id} className={`rounded-2xl border bg-nieve p-4 ${p.suspendida ? "border-fuego/40" : "border-linea"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">
                {p.suspendida ? (
                  p.nombre
                ) : (
                  <Link href={`/${p.slug}`} target="_blank" className="underline-offset-4 hover:underline">
                    {p.nombre}
                  </Link>
                )}
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${p.suspendida ? "bg-fuego/15 text-fuego-hondo" : "bg-musgo/15 text-musgo"}`}
              >
                {p.suspendida ? "Suspendida" : "Activa"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-tinta-suave">
              {p.cabanas} {p.cabanas === 1 ? "cabaña" : "cabañas"} · {p.reservasVigentes} {p.reservasVigentes === 1 ? "reserva vigente" : "reservas vigentes"}
            </p>
            <p className="text-sm text-tinta-suave">
              {p.admins.length ? p.admins.map((a) => `${a.email} (${a.rol === "dueno" ? "dueño" : "staff"})`).join(", ") : "Sin administradores"}
            </p>
            {p.suspendida && p.suspendidaEn && (
              <p className="mt-1 text-sm">
                Suspendida el {formatearFechaHora(p.suspendidaEn)}
                {p.suspendidaPor && ` por ${p.suspendidaPor}`}.
              </p>
            )}
            <div className="mt-4 grid gap-4 border-t border-linea pt-4 sm:grid-cols-2">
              <SelectorResenas propiedadId={p.id} etapa={p.resenas} />
              <BotonSuspension propiedadId={p.id} nombre={p.nombre} suspendida={p.suspendida} reservasVigentes={p.reservasVigentes} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
