// Solicitudes de reserva en el resumen del día (cabañas con aprobación manual). Server Component;
// los botones Aprobar / Rechazar son el mismo componente del detalle de la reserva.

import Link from "next/link";
import { formatearFechaCorta, formatearFechaHora } from "@/lib/formato";
import type { EstadoReserva } from "@/lib/estados-reserva";
import { AccionesSolicitud } from "./reservas/[codigo]/acciones-solicitud";
import { Lista, Seccion } from "./resumen";

export interface SolicitudResumen {
  codigo: string;
  estado: EstadoReserva;
  cabana: string;
  huesped: string;
  email: string;
  telefono: string;
  checkIn: string;
  checkOut: string;
  personas: number;
  mensaje: string | null;
  expiraEn: Date | null;
  avisoFallido: string | null;
  /** Historial del huésped con este dueño (reseñas privadas); null si las reseñas del huésped están apagadas. */
  historial?: { texto: string; etiquetas: string[]; otros: string | null } | null;
}

export function SeccionSolicitudes({
  solicitudes,
  cabanasSinAprobacion,
  variasCabanas,
}: {
  solicitudes: SolicitudResumen[];
  /** Cabañas con la aprobación apagada que aún tienen solicitudes por responder. */
  cabanasSinAprobacion: string[];
  variasCabanas: boolean;
}) {
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente_aprobacion");
  const porPagar = solicitudes.filter((s) => s.estado === "aprobada_pendiente_pago");
  if (!solicitudes.length) return null;

  return (
    <>
      {cabanasSinAprobacion.length > 0 && (
        <p role="status" className="mt-6 rounded-2xl border border-lago/30 bg-lago/10 px-4 py-3 text-sm">
          Desactivaste la aprobación manual en <strong>{cabanasSinAprobacion.join(", ")}</strong>, pero quedan solicitudes por
          responder. Siguen vigentes hasta que las apruebes, las rechaces o venzan.
        </p>
      )}

      {pendientes.length > 0 && (
        <Seccion titulo="Solicitudes pendientes" cantidad={pendientes.length}>
          <ul className="grid gap-3">
            {pendientes.map((s) => (
              <li key={s.codigo} className="rounded-2xl border border-lago/30 bg-nieve p-4">
                <Link href={`/admin/reservas/${s.codigo}`} className="block text-lg font-bold underline-offset-4 hover:underline">
                  {s.huesped}
                </Link>
                <p className="mt-0.5 text-sm text-tinta-suave">
                  {variasCabanas && `${s.cabana}, `}
                  {formatearFechaCorta(s.checkIn)} → {formatearFechaCorta(s.checkOut)} · {s.personas}{" "}
                  {s.personas === 1 ? "persona" : "personas"}
                </p>
                <p className="text-sm text-tinta-suave">
                  <a href={`tel:${s.telefono}`} className="text-lago underline decoration-lago/30 underline-offset-4">
                    {s.telefono}
                  </a>
                </p>
                {s.historial && (
                  <Link
                    href={`/admin/reservas/${s.codigo}#historial-huesped`}
                    className="mt-2 block rounded-xl border border-linea px-3.5 py-2.5 text-sm hover:bg-papel-hondo/60"
                  >
                    <span className="font-semibold">Historial contigo:</span> {s.historial.texto}
                    {s.historial.etiquetas.length > 0 && <span className="text-tinta-suave"> · {s.historial.etiquetas.join(", ")}</span>}
                    {s.historial.otros && <span className="block text-tinta-suave">Otros anfitriones: {s.historial.otros}</span>}
                    <span className="block font-semibold text-lago">Ver detalle</span>
                  </Link>
                )}
                {s.mensaje && <p className="mt-2 rounded-xl bg-papel-hondo/60 px-3.5 py-2.5 text-sm whitespace-pre-line">«{s.mensaje}»</p>}
                {s.expiraEn && (
                  <p className="mt-2 text-sm">
                    Responde antes del <strong>{formatearFechaHora(s.expiraEn)}</strong>.
                  </p>
                )}
                {s.avisoFallido && <p className="mt-2 text-sm font-semibold text-alerta-hondo">Aviso sin enviar: {s.avisoFallido}</p>}
                <div className="mt-3">
                  <AccionesSolicitud codigo={s.codigo} huesped={s.huesped} />
                </div>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {porPagar.length > 0 && (
        <Seccion titulo="Esperando pago" cantidad={porPagar.length}>
          <Lista>
            {porPagar.map((s) => (
              <li key={s.codigo} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/reservas/${s.codigo}`} className="block truncate font-semibold underline-offset-4 hover:underline">
                    {s.huesped}
                  </Link>
                  <p className="truncate text-sm text-tinta-suave">
                    {variasCabanas && `${s.cabana}, `}
                    {formatearFechaCorta(s.checkIn)} → {formatearFechaCorta(s.checkOut)}
                  </p>
                  {s.avisoFallido && <p className="text-sm font-semibold text-alerta-hondo">Correo sin enviar</p>}
                </div>
                {s.expiraEn && (
                  <span className="text-right text-sm">
                    <span className="block text-xs text-tinta-suave">Paga hasta</span>
                    <span className="block font-semibold">{formatearFechaHora(s.expiraEn).replace(/ de \d{4}/, "")}</span>
                  </span>
                )}
              </li>
            ))}
          </Lista>
        </Seccion>
      )}
    </>
  );
}
