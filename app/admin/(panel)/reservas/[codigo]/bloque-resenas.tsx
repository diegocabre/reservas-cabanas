// Reseñas en el detalle de la reserva (panel): la reseña PRIVADA del huésped que escribe el dueño
// y el historial del huésped con este dueño. Nunca se muestra en páginas públicas ni en correos.

import Link from "next/link";
import { formatearFechaCorta } from "@/lib/formato";
import type { HistorialHuesped, resenasDeReserva } from "@/lib/resenas";
import { CALIFICACIONES, DIAS_DOBLE_CIEGO, ETIQUETAS, esEtiqueta } from "@/lib/resenas-reglas";
import { FormularioResenaHuesped } from "./resena-huesped";

export interface ResenasDetalle {
  estado: Awaited<ReturnType<typeof resenasDeReserva>>;
  historial: HistorialHuesped;
}

const etiquetas = (lista: string[]) => lista.filter(esEtiqueta).map((e) => ETIQUETAS[e]).join(", ");

export function BloqueResenas({ codigo, resenas }: { codigo: string; resenas: ResenasDetalle }) {
  const { estado, historial } = resenas;
  const propia = estado?.resenaHuesped ?? null;
  const editable = estado?.elegible && (!propia || propia.estado === "retenida");

  return (
    <>
      <section id="resena-huesped" className="mt-8 scroll-mt-6">
        <h2 className="font-display text-xl font-semibold">Tu reseña del huésped</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Privada: solo la ven los administradores de tu propiedad y, una vez publicada, el huésped (que puede responderla).
        </p>
        <div className="mt-3 rounded-2xl border border-linea bg-nieve p-4">
          {editable ? (
            <>
              {propia && (
                <p className="mb-3 text-sm">
                  Guardada. Se publica cuando el huésped escriba la suya o a los {DIAS_DOBLE_CIEGO} días del check-out; hasta entonces puedes editarla.
                </p>
              )}
              <FormularioResenaHuesped
                codigo={codigo}
                previa={propia ? { calificacion: propia.calificacion, etiquetas: propia.etiquetas, comentario: propia.comentario } : null}
              />
            </>
          ) : propia ? (
            <div className="text-sm">
              <p className="font-semibold">
                {CALIFICACIONES[propia.calificacion]} <span className="font-normal text-tinta-suave">· publicada, ya no se edita</span>
              </p>
              {propia.etiquetas.length > 0 && <p className="mt-1">{etiquetas(propia.etiquetas)}</p>}
              {propia.comentario && <p className="mt-1 whitespace-pre-line">{propia.comentario}</p>}
            </div>
          ) : (
            <p className="text-sm text-tinta-suave">{estado?.motivo ?? "Esta reserva no se puede reseñar."}</p>
          )}
          {estado?.resenaCabanaVisible && (
            <p className="mt-3 border-t border-linea pt-3 text-sm">
              El huésped también dejó su reseña de la cabaña. Mírala en{" "}
              <Link href="/admin/resenas" className="font-semibold text-lago underline underline-offset-4">
                Reseñas
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section id="historial-huesped" className="mt-8 scroll-mt-6">
        <h2 className="font-display text-xl font-semibold">Historial del huésped contigo</h2>
        <div className="mt-3 rounded-2xl border border-linea bg-nieve p-4 text-sm">
          <p className="font-semibold">{historial.resumen.texto}</p>
          {historial.resumen.etiquetas.length > 0 && <p className="mt-0.5 text-tinta-suave">{historial.resumen.etiquetas.join(", ")}</p>}
          {historial.otros && <p className="mt-2 text-tinta-suave">Otros anfitriones: {historial.otros.texto}</p>}
          {historial.resenas.length > 0 && (
            <ul className="mt-3 divide-y divide-linea border-t border-linea">
              {historial.resenas.map((h) => (
                <li key={h.id} className="py-3">
                  <p className="font-semibold">
                    {CALIFICACIONES[h.calificacion]}
                    <span className="font-normal text-tinta-suave">
                      {" "}
                      · {h.reserva.cabana.nombre}, llegada {formatearFechaCorta(h.reserva.checkIn)}
                      {h.estado === "retenida" && " · aún no publicada"}
                    </span>
                  </p>
                  {h.etiquetas.length > 0 && <p className="mt-0.5">{etiquetas(h.etiquetas)}</p>}
                  {h.comentario && <p className="mt-0.5 whitespace-pre-line">{h.comentario}</p>}
                  {h.replica && (
                    <p className="mt-2 rounded-xl bg-papel-hondo/60 px-3 py-2">
                      <span className="font-semibold">Réplica del huésped:</span> {h.replica.texto}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
