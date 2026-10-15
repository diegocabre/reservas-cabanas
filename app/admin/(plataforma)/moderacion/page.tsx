import type { Metadata } from "next";
import { requerirSuperadmin } from "@/lib/admin";
import { formatearFechaHora } from "@/lib/formato";
import { colaModeracion } from "@/lib/resenas";
import { MOTIVOS_REPORTE } from "@/lib/resenas-reglas";
import { botonPrincipal, botonSecundario } from "../../(panel)/reservas/[codigo]/acciones-reserva";
import { accionAtenderSolicitud, accionResolverReporte } from "./acciones";

export const metadata: Metadata = { title: "Moderación" };

const caja = "rounded-2xl border border-linea bg-nieve p-4";
const TIPO = { rectificacion: "Rectificación", eliminacion: "Eliminación" } as const;

/** Cola de la plataforma (Soluciones DyS): reportes de reseñas y solicitudes de privacidad. 404 para el resto. */
export default async function PaginaModeracion() {
  await requerirSuperadmin();
  const { reportes, solicitudes } = await colaModeracion();

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Moderación</h1>
      <p className="mt-1 text-sm text-tinta-suave">Ocultar no borra: la reseña se conserva en la base y deja de mostrarse.</p>

      <section className="mt-8" aria-labelledby="titulo-reportes">
        <h2 id="titulo-reportes" className="font-display text-xl font-semibold">
          Reportes de reseñas ({reportes.length})
        </h2>
        <ul className="mt-3 grid gap-3">
          {reportes.map((r) => (
            <li key={r.id} className={caja}>
              <p className="text-sm text-tinta-suave">
                {r.resena.cabana.propiedad.nombre} · {r.resena.cabana.nombre} · reportada por {r.email} el {formatearFechaHora(r.createdAt)}
              </p>
              <p className="mt-1 font-semibold">
                {MOTIVOS_REPORTE[r.motivo]}
                {r.detalle && <span className="font-normal">: «{r.detalle}»</span>}
              </p>
              <blockquote className="mt-2 rounded-xl bg-papel-hondo/60 px-3.5 py-2.5 text-sm whitespace-pre-line">
                <strong>{r.resena.nombrePublico}:</strong> {r.resena.comentario}
              </blockquote>
              <form action={accionResolverReporte} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="reporteId" value={r.id} />
                <button type="submit" name="decision" value="ocultar" className={`${botonPrincipal} bg-fuego-hondo`}>
                  Ocultar reseña
                </button>
                <button type="submit" name="decision" value="mantener" className={botonSecundario}>
                  Mantener publicada
                </button>
              </form>
            </li>
          ))}
          {!reportes.length && <li className="text-sm text-tinta-suave">Sin reportes pendientes.</li>}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="titulo-privacidad">
        <h2 id="titulo-privacidad" className="font-display text-xl font-semibold">
          Solicitudes de privacidad ({solicitudes.length})
        </h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Rectificar o eliminar se hace a mano (nada se borra solo). Responde al huésped por correo y luego márcala como atendida.
        </p>
        <ul className="mt-3 grid gap-3">
          {solicitudes.map((s) => (
            <li key={s.id} className={caja}>
              <p className="text-sm text-tinta-suave">
                {TIPO[s.tipo]} · {s.huesped.nombrePila} ({s.huesped.email}) · {formatearFechaHora(s.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-line">{s.mensaje}</p>
              <form action={accionAtenderSolicitud} className="mt-3">
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className={botonSecundario}>
                  Marcar como atendida
                </button>
              </form>
            </li>
          ))}
          {!solicitudes.length && <li className="text-sm text-tinta-suave">Sin solicitudes pendientes.</li>}
        </ul>
      </section>
    </>
  );
}
