import type { Metadata } from "next";
import Link from "next/link";
import { IconoWhatsapp } from "@/components/iconos";
import { requerirAdmin } from "@/lib/admin";
import { formatearFechaCorta, formatearFechaHora, hoyEnChile } from "@/lib/formato";
import { datosResenasPanel } from "@/lib/resenas";
import { CATEGORIAS, DIAS_DOBLE_CIEGO, MOTIVOS_REPORTE, notaGeneral, resenasCabanaActivas, resenasHuespedActivas } from "@/lib/resenas-reglas";
import { AccionesResena } from "./acciones-resena";

export const metadata: Metadata = { title: "Reseñas" };

const caja = "rounded-2xl border border-linea bg-nieve";

export default async function PaginaResenas({ searchParams }: PageProps<"/admin/resenas">) {
  const admin = await requerirAdmin();
  if (!resenasCabanaActivas()) {
    return (
      <>
        <h1 className="font-display text-3xl font-semibold">Reseñas</h1>
        <p className="mt-3 text-tinta-suave">Las reseñas todavía no están activadas en la plataforma.</p>
      </>
    );
  }
  const { error } = await searchParams;
  const hoy = hoyEnChile();
  const { resenas, recientes } = await datosResenasPanel(admin, hoy);
  const variasCabanas = new Set([...resenas.map((r) => r.cabana.nombre), ...recientes.map((r) => r.cabana.nombre)]).size > 1;

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Reseñas</h1>
      <p className="mt-1 text-sm text-tinta-suave">
        Las reseñas se publican cuando escriben las dos partes o a los {DIAS_DOBLE_CIEGO} días del check-out. Hasta entonces no ves
        lo que escribió el huésped, ni él lo tuyo.
      </p>

      {error === "whatsapp" && (
        <p role="alert" className="mt-5 rounded-2xl bg-alerta/10 px-4 py-3 text-sm font-semibold text-alerta-hondo">
          No pudimos abrir WhatsApp: revisa que la estadía siga dentro del plazo de 30 días y que el huésped tenga un teléfono válido.
        </p>
      )}

      <section className="mt-8" aria-labelledby="titulo-recientes">
        <h2 id="titulo-recientes" className="font-display text-xl font-semibold">
          Estadías recientes
        </h2>
        {recientes.length ? (
          <ul className={`mt-3 divide-y divide-linea ${caja}`}>
            {recientes.map((r) => (
              <li key={r.codigo} className="grid gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/reservas/${r.codigo}`} className="block truncate font-semibold underline-offset-4 hover:underline">
                      {r.huespedNombre}
                    </Link>
                    <p className="text-sm text-tinta-suave">
                      {variasCabanas && `${r.cabana.nombre}, `}salió el {formatearFechaCorta(r.checkOut)}
                    </p>
                  </div>
                  {resenasHuespedActivas() && (
                    <span className="shrink-0 text-right text-sm">
                      {r.resenaHuesped ? (
                        <span className="font-semibold text-musgo">Reseñaste al huésped</span>
                      ) : (
                        <Link href={`/admin/reservas/${r.codigo}#resena-huesped`} className="font-semibold text-lago underline underline-offset-4">
                          Reseñar huésped
                        </Link>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-tinta-suave">
                  {r.cicloResena?.desbloqueadoEn ? (
                    <span>Reseñas publicadas</span>
                  ) : (
                    <>
                      <a
                        href={`/admin/resenas/whatsapp/${encodeURIComponent(r.codigo)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-musgo px-4 font-bold text-nieve hover:opacity-90"
                      >
                        <IconoWhatsapp className="size-5" />
                        Pedir reseña por WhatsApp
                      </a>
                      {r.cicloResena?.whatsappAbiertoEn && <span>WhatsApp abierto el {formatearFechaHora(r.cicloResena.whatsappAbiertoEn)}</span>}
                      {r.cicloResena?.invitacionEnviadaEn && <span>Correo enviado</span>}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-linea px-4 py-4 text-sm text-tinta-suave">
            No hay estadías terminadas en los últimos 30 días.
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="titulo-recibidas">
        <h2 id="titulo-recibidas" className="font-display text-xl font-semibold">
          Reseñas de tus cabañas
        </h2>
        {resenas.length ? (
          <ul className="mt-3 grid gap-3">
            {resenas.map((r) => {
              const reporte = r.reportes[0];
              return (
                <li key={r.id} className={`${caja} p-4`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-bold">
                      {r.nombrePublico}
                      {variasCabanas && <span className="font-normal text-tinta-suave"> · {r.cabana.nombre}</span>}
                    </p>
                    <p className="shrink-0 text-lg font-bold tabular-nums">{notaGeneral(r).toLocaleString("es-CL")} ★</p>
                  </div>
                  <p className="text-xs text-tinta-suave">
                    {r.publicadaEn && `Publicada el ${formatearFechaHora(r.publicadaEn)} · `}
                    {CATEGORIAS.map((c) => `${c.nombre} ${r[c.clave]}`).join(" · ")}
                  </p>
                  {r.estado === "oculta" && (
                    <p className="mt-2 rounded-xl bg-papel-hondo px-3 py-2 text-sm font-semibold">Oculta por moderación: no se muestra en la página.</p>
                  )}
                  {r.prueba && r.estado !== "oculta" && (
                    <p className="mt-2 rounded-xl bg-lago/10 px-3 py-2 text-sm font-semibold text-lago">
                      Reserva de prueba: esta reseña nunca se muestra en la página pública.
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-line">{r.comentario}</p>
                  {r.respuesta && (
                    <div className="mt-3 rounded-xl bg-papel-hondo/60 px-3.5 py-2.5 text-sm">
                      <p className="font-semibold">Tu respuesta</p>
                      <p className="mt-0.5 whitespace-pre-line">{r.respuesta.texto}</p>
                    </div>
                  )}
                  {reporte && (
                    <p className="mt-2 text-sm text-tinta-suave">
                      Reportaste esta reseña ({MOTIVOS_REPORTE[reporte.motivo].toLowerCase()}):{" "}
                      {reporte.estado === "pendiente" ? "en revisión." : reporte.estado === "aceptado" ? "se ocultó." : "se revisó y se mantuvo."}
                    </p>
                  )}
                  {r.estado === "publicada" && (
                    <AccionesResena
                      resenaId={r.id}
                      respuesta={r.respuesta?.texto ?? null}
                      respuestaEditable={r.respuestaEditable}
                      reportada={reporte?.estado === "pendiente"}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-linea px-4 py-4 text-sm text-tinta-suave">
            Todavía no hay reseñas publicadas.
          </p>
        )}
      </section>
    </>
  );
}
