import type { Metadata } from "next";
import Link from "next/link";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { formatearFechaCorta, formatearFechaHora } from "@/lib/formato";
import { abrirAccesoHuesped } from "@/lib/resenas";
import { CALIFICACIONES, ETIQUETAS, esEtiqueta } from "@/lib/resenas-reglas";
import { FormularioReplica, FormularioSolicitud } from "../formularios";

export const metadata: Metadata = { title: "Mis datos", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const caja = "mt-3 rounded-3xl border border-linea bg-nieve p-5";
const TIPO = { rectificacion: "Corrección", eliminacion: "Eliminación" } as const;
const ESTADO = { pendiente: "en revisión", aceptado: "atendida", descartado: "revisada" } as const;

export default async function PaginaMisDatosToken({ params }: PageProps<"/mis-datos/[token]">) {
  const token = decodeURIComponent((await params).token);
  const datos = await abrirAccesoHuesped(token);

  if (!datos) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-12 pb-16 text-center">
        <PerfilVolcan className="mx-auto h-10 w-48" />
        <h1 className="mt-5 font-display text-3xl font-semibold">Este link venció</h1>
        <p className="mt-2 text-tinta-suave">
          Los links duran 24 horas.{" "}
          <Link href="/mis-datos" className="font-semibold text-lago underline underline-offset-2">
            Pide uno nuevo
          </Link>
          .
        </p>
      </main>
    );
  }

  const { huesped, resenas, solicitudes, reservas } = datos;
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-12 pb-16">
      <h1 className="font-display text-3xl font-semibold">Hola, {huesped.nombrePila}</h1>

      <section className="mt-8" aria-labelledby="titulo-datos">
        <h2 id="titulo-datos" className="font-display text-xl font-semibold">
          Lo que guardamos sobre ti
        </h2>
        <dl className={`${caja} grid gap-2 text-sm`}>
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-suave">Email</dt>
            <dd className="font-semibold break-all">{huesped.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-suave">Teléfono</dt>
            <dd className="font-semibold">{huesped.telefono ?? "No registrado"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-suave">Reservas</dt>
            <dd className="font-semibold">{reservas}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-tinta-suave">
          Además, cada reserva guarda tu nombre completo, RUT y teléfono para que el alojamiento la gestione.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="titulo-resenas">
        <h2 id="titulo-resenas" className="font-display text-xl font-semibold">
          Reseñas de los anfitriones sobre ti
        </h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Son privadas: solo las ven los administradores del alojamiento que la escribió. Aparecen aquí cuando se publican.
        </p>
        {resenas.length ? (
          <ul className="grid gap-3">
            {resenas.map((r) => (
              <li key={r.id} className={caja}>
                <p className="text-sm text-tinta-suave">
                  {r.propiedad.nombre} · {r.reserva.cabana.nombre} · {formatearFechaCorta(r.reserva.checkIn)} al {formatearFechaCorta(r.reserva.checkOut)}
                </p>
                <p className="mt-1 font-bold">{CALIFICACIONES[r.calificacion]}</p>
                {r.etiquetas.length > 0 && (
                  <p className="text-sm">
                    {r.etiquetas
                      .filter(esEtiqueta)
                      .map((e) => ETIQUETAS[e])
                      .join(", ")}
                  </p>
                )}
                {r.comentario && <p className="mt-2 whitespace-pre-line">{r.comentario}</p>}
                <FormularioReplica token={token} resenaId={r.id} previa={r.replica?.texto ?? null} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${caja} text-sm text-tinta-suave`}>No hay reseñas publicadas sobre ti.</p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="titulo-solicitud">
        <h2 id="titulo-solicitud" className="font-display text-xl font-semibold">
          Corregir o eliminar tu información
        </h2>
        {solicitudes.length > 0 && (
          <ul className="mt-2 text-sm text-tinta-suave">
            {solicitudes.map((s) => (
              <li key={s.id}>
                {TIPO[s.tipo]} pedida el {formatearFechaHora(s.createdAt)}: {ESTADO[s.estado]}.
              </li>
            ))}
          </ul>
        )}
        <div className={caja}>
          <FormularioSolicitud token={token} />
        </div>
        {/* PENDIENTE de revisión legal (Ley 21.719): plazos de respuesta y responsable del tratamiento. */}
        <p className="mt-3 text-xs text-tinta-suave">
          Revisamos cada solicitud a mano y te respondemos por correo. Algunas reservas deben conservarse por obligaciones legales
          o contables.
        </p>
      </section>
    </main>
  );
}
