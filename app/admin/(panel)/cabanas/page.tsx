import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/admin";
import { configuracionCabanas } from "@/lib/panel-datos";
import { FormularioAprobacion } from "./formulario";

export const metadata: Metadata = { title: "Cabañas" };

export default async function PaginaCabanas({ searchParams }: PageProps<"/admin/cabanas">) {
  const admin = await requerirAdmin();
  const { hecho } = await searchParams;
  const cabanas = await configuracionCabanas(admin);
  const variasPropiedades = admin.propiedades.length > 1;

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Cabañas</h1>
      <p className="mt-2 max-w-prose text-tinta-suave">
        Elige, cabaña por cabaña, si las reservas se confirman al pagar o si primero quieres aprobar a cada huésped. Los
        cambios rigen para las reservas nuevas.
      </p>

      <ul className="mt-6 grid gap-4">
        {cabanas.map((c) => (
          <li key={c.id} className="rounded-2xl border border-linea bg-nieve p-5">
            <h2 className="font-display text-xl font-semibold">
              {c.nombre}
              {variasPropiedades && <span className="font-sans text-base font-normal text-tinta-suave"> · {c.propiedad.nombre}</span>}
            </h2>
            {!c.activa && <p className="text-sm text-tinta-suave">No está publicada.</p>}

            {hecho === c.id && (
              <p role="status" className="mt-3 rounded-xl bg-musgo/15 px-3.5 py-2.5 text-sm font-semibold text-musgo">
                Guardado. Las reservas nuevas de {c.nombre}{" "}
                {c.requiereAprobacion ? "llegarán como solicitudes." : "se confirman al pagar."}
              </p>
            )}
            {!c.requiereAprobacion && c.solicitudesPendientes > 0 && (
              <p className="mt-3 rounded-xl bg-lago/10 px-3.5 py-2.5 text-sm">
                La aprobación manual está apagada, pero quedan{" "}
                <strong>
                  {c.solicitudesPendientes} {c.solicitudesPendientes === 1 ? "solicitud" : "solicitudes"}
                </strong>{" "}
                por responder. Siguen vigentes hasta que las resuelvas o venzan.
              </p>
            )}

            <div className="mt-4">
              {c.esDueno ? (
                <FormularioAprobacion cabana={c} />
              ) : (
                <p className="text-sm text-tinta-suave">
                  Aprobación manual: <strong className="text-tinta">{c.requiereAprobacion ? "activada" : "apagada"}</strong>. Solo
                  el dueño de la propiedad puede cambiarla.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
