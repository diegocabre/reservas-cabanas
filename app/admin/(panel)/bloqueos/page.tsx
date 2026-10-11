import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/admin";
import { describirRango, nombreMotivo } from "@/lib/bloqueos";
import { formatearFechaCorta, hoyEnChile } from "@/lib/formato";
import { listarBloqueos } from "@/lib/panel-bloqueos";
import { cabanasDelAdmin } from "@/lib/panel-datos";
import { EliminarBloqueo, FormularioBloqueo } from "./formularios";

export const metadata: Metadata = { title: "Bloqueos" };

const HECHO = {
  creado: "Fechas bloqueadas. Ya no aparecen disponibles en el calendario de reserva.",
  eliminado: "Bloqueo liberado. Esas noches se pueden reservar de nuevo.",
} as const;

export default async function PaginaBloqueos({ searchParams }: PageProps<"/admin/bloqueos">) {
  const admin = await requerirAdmin();
  const hoy = hoyEnChile();
  const { hecho } = await searchParams;
  const [cabanas, bloqueos] = await Promise.all([cabanasDelAdmin(admin), listarBloqueos(admin, hoy)]);
  const variasCabanas = cabanas.length > 1;
  const variasPropiedades = admin.propiedades.length > 1;
  const mensaje = typeof hecho === "string" && Object.hasOwn(HECHO, hecho) ? HECHO[hecho as keyof typeof HECHO] : null;

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Bloqueos</h1>
      <p className="mt-2 max-w-prose text-tinta-suave">
        Bloquea las noches que vendiste en Airbnb o Booking, o que no quieres arrendar. Dejan de aparecer disponibles para
        reservar aquí.
      </p>

      {mensaje && (
        <p role="status" className="mt-5 rounded-2xl bg-musgo/15 px-4 py-3 text-sm font-semibold text-musgo">
          {mensaje}
        </p>
      )}

      <section className="mt-6">
        <h2 className="font-display text-xl font-semibold">Bloquear fechas</h2>
        <div className="mt-3">
          <FormularioBloqueo
            cabanas={cabanas.map((c) => ({ id: c.id, nombre: variasPropiedades ? `${c.propiedad.nombre}: ${c.nombre}` : c.nombre }))}
            hoy={hoy}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="flex items-baseline gap-2 font-display text-xl font-semibold">
          Fechas bloqueadas
          <span className="font-sans text-base font-bold text-tinta-suave tabular-nums">{bloqueos.length}</span>
        </h2>
        {bloqueos.length ? (
          <ul className="mt-3 divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-nieve">
            {bloqueos.map((b) => {
              const rango = describirRango(b, formatearFechaCorta);
              return (
                <li key={b.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{nombreMotivo(b.motivo)}</p>
                    <p className="text-sm text-tinta-suave">
                      {variasCabanas && `${b.cabana.nombre}, `}
                      {rango}
                    </p>
                    {b.creadoPor && (
                      <p className="text-xs text-tinta-suave">
                        Lo creó {b.creadoPor.email} el {formatearFechaCorta(hoyEnChile(b.creadoPor.createdAt))}
                      </p>
                    )}
                  </div>
                  {b.origen === "manual" ? (
                    <EliminarBloqueo id={b.id} descripcion={rango} />
                  ) : (
                    <span className="text-xs text-tinta-suave">Desde el calendario de {b.origen}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-linea px-4 py-4 text-sm text-tinta-suave">
            No hay fechas bloqueadas desde hoy en adelante.
          </p>
        )}
      </section>
    </>
  );
}
