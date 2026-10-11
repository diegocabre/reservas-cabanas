import Link from "next/link";
import type { ReactNode } from "react";
import { IconoFlecha, IconoWhatsapp } from "@/components/iconos";
import { accionesDisponibles, NOMBRE_ESTADO, NOMBRE_MEDIO, tieneRevisarPago } from "@/lib/estados-reserva";
import { formatearCLP, formatearFechaCorta, formatearFechaLarga, formatearHora, hoyEnChile } from "@/lib/formato";
import { MARCA_REVISAR } from "@/lib/pagos";
import type { DetalleReserva } from "@/lib/panel-datos";
import { enlaceWhatsapp, mensajeAlHuesped } from "@/lib/whatsapp";
import { EtiquetaEstado } from "../../resumen";
import { AccionesReserva } from "./acciones-reserva";

const HECHO = {
  confirmada: "Reserva confirmada. Le enviamos el email de confirmación al huésped.",
  cancelada: "Reserva cancelada. Las fechas quedaron libres.",
  pago: "Pago registrado.",
  revisado: "Pago marcado como revisado.",
} as const;

const ACCION = {
  confirmar: "Confirmó la reserva",
  cancelar: "Canceló la reserva",
  registrar_pago: "Registró un pago",
  marcar_revisado: "Marcó el pago como revisado",
  crear_bloqueo: "Bloqueó fechas",
  eliminar_bloqueo: "Liberó fechas bloqueadas",
} as const;

const ORIGEN = { web: "Reserva web", airbnb: "Airbnb", booking: "Booking", manual: "Reserva manual" } as const;
const ESTADO_PAGO = { aprobado: "Aprobado", pendiente: "En proceso", rechazado: "Rechazado" } as const;

/** Fecha y hora en Chile: "dom 11 oct, 15:05". */
const fechaHora = (f: Date) => `${formatearFechaCorta(hoyEnChile(f))}, ${formatearHora(f)}`;

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-sm text-tinta-suave">{nombre}</dt>
      <dd className="min-w-0 text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

const caja = "divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-nieve";

export function VistaDetalle({ r, hecho, hoy }: { r: DetalleReserva; hecho?: string; hoy: string }) {
  const puede = accionesDisponibles({ estado: r.estado, total: r.total, pagado: r.pagado, notas: r.notas });
  const revisar = tieneRevisarPago(r.notas);
  const whatsapp = enlaceWhatsapp(
    r.huespedTelefono,
    mensajeAlHuesped({ nombre: r.huespedNombre, propiedad: r.cabana.propiedad.nombre, codigo: r.codigo, checkIn: r.checkIn }),
  );
  const mensajeHecho = hecho && Object.hasOwn(HECHO, hecho) ? HECHO[hecho as keyof typeof HECHO] : null;

  return (
    <>
      <Link href="/admin/reservas" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-lago">
        <IconoFlecha className="size-4 rotate-180" />
        Reservas
      </Link>

      <header className="mt-1">
        <div className="flex flex-wrap items-center gap-2">
          <EtiquetaEstado estado={r.estado} vencida={r.vencida} />
          {revisar && <EtiquetaEstado estado="revisar" />}
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-balance">{r.huespedNombre}</h1>
        <p className="mt-0.5 font-semibold tracking-wide text-tinta-suave tabular-nums">{r.codigo}</p>
      </header>

      {mensajeHecho && (
        <p role="status" className="mt-5 rounded-2xl bg-musgo/15 px-4 py-3 text-sm font-semibold text-musgo">
          {mensajeHecho}
        </p>
      )}

      {revisar && (
        <section aria-labelledby="titulo-revisar" className="mt-5 rounded-2xl border border-fuego/40 bg-fuego/10 p-4 text-sm">
          <h2 id="titulo-revisar" className="font-bold text-fuego-hondo">
            Pago por revisar
          </h2>
          {r.notas
            ?.split("\n")
            .filter((l) => l.includes(MARCA_REVISAR))
            .map((l) => (
              <p key={l} className="mt-1">
                {l.replace(MARCA_REVISAR, "").trim()}
              </p>
            ))}
          <p className="mt-2 text-tinta-suave">
            Revisa el pago en tu cuenta de Mercado Pago. Si corresponde, confirma la reserva; si lo devolviste, márcalo como revisado.
          </p>
        </section>
      )}

      <Bloque titulo="Acciones">
        <AccionesReserva codigo={r.codigo} huesped={r.huespedNombre} saldo={r.saldo} hoy={hoy} puede={puede} />
      </Bloque>

      <Bloque titulo="Estadía">
        <dl className={caja}>
          <Dato nombre="Cabaña">{r.cabana.nombre}</Dato>
          <Dato nombre="Llegada">{formatearFechaLarga(r.checkIn)}</Dato>
          <Dato nombre="Salida">{formatearFechaLarga(r.checkOut)}</Dato>
          <Dato nombre="Noches">{r.noches}</Dato>
          <Dato nombre="Personas">
            {r.adultos} {r.adultos === 1 ? "adulto" : "adultos"}
            {r.ninos > 0 && `, ${r.ninos} ${r.ninos === 1 ? "niño" : "niños"}`}
          </Dato>
          <Dato nombre="Origen">{ORIGEN[r.origen]}</Dato>
          <Dato nombre="Creada">{fechaHora(r.createdAt)}</Dato>
        </dl>
      </Bloque>

      <Bloque titulo="Huésped">
        <dl className={caja}>
          <Dato nombre="Email">
            <a href={`mailto:${r.huespedEmail}`} className="text-lago underline decoration-lago/30 underline-offset-4">
              {r.huespedEmail}
            </a>
          </Dato>
          <Dato nombre="Teléfono">
            <a href={`tel:${r.huespedTelefono}`} className="text-lago underline decoration-lago/30 underline-offset-4">
              {r.huespedTelefono}
            </a>
          </Dato>
          <Dato nombre="RUT">{r.huespedRut ?? "No informado"}</Dato>
        </dl>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-musgo px-5 py-3 font-bold text-nieve transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
          >
            <IconoWhatsapp className="size-5" />
            Escribir por WhatsApp
          </a>
        )}
      </Bloque>

      <Bloque titulo="Precio">
        <dl className={caja}>
          <Dato nombre={r.precioNoche ? `${r.noches} ${r.noches === 1 ? "noche" : "noches"} × ${formatearCLP(r.precioNoche)}` : "Total"}>
            {formatearCLP(r.total)}
          </Dato>
          <Dato nombre="Abono para reservar">{formatearCLP(r.abono)}</Dato>
          <Dato nombre="Pagado">{formatearCLP(r.pagado)}</Dato>
          <div className="flex items-baseline justify-between gap-4 bg-papel-hondo/50 px-4 py-3">
            <dt className="font-semibold">Saldo por cobrar</dt>
            <dd className={`text-lg font-bold tabular-nums ${r.saldo > 0 ? "text-fuego-hondo" : "text-musgo"}`}>
              {r.saldo > 0 ? formatearCLP(r.saldo) : "Pagado completo"}
            </dd>
          </div>
        </dl>
      </Bloque>

      <Bloque titulo="Pagos">
        {r.pagos.length ? (
          <ul className={caja}>
            {r.pagos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{NOMBRE_MEDIO[p.proveedor]}</p>
                  <p className="truncate text-sm text-tinta-suave">
                    {ESTADO_PAGO[p.estado]}
                    {p.pagadoEn ? `, ${formatearFechaCorta(hoyEnChile(p.pagadoEn))}` : `, ${fechaHora(p.createdAt)}`}
                    {p.refExterna && ` · N° ${p.refExterna}`}
                  </p>
                </div>
                <span className={`font-bold tabular-nums ${p.estado === "aprobado" ? "" : "text-tinta-suave line-through"}`}>
                  {formatearCLP(p.monto)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-linea px-4 py-4 text-sm text-tinta-suave">Todavía no hay pagos.</p>
        )}
      </Bloque>

      {r.notas && (
        <Bloque titulo="Notas">
          <p className="rounded-2xl border border-linea bg-nieve px-4 py-3 text-sm whitespace-pre-line">{r.notas}</p>
        </Bloque>
      )}

      <Bloque titulo="Historial de cambios">
        {r.auditoria.length ? (
          <ol className={caja}>
            {r.auditoria.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm">
                <p className="font-semibold">
                  {ACCION[a.accion]}
                  {a.estadoAntes && a.estadoDespues && a.estadoAntes !== a.estadoDespues && (
                    <span className="font-normal text-tinta-suave">
                      {" "}
                      ({NOMBRE_ESTADO[a.estadoAntes].toLowerCase()} a {NOMBRE_ESTADO[a.estadoDespues].toLowerCase()})
                    </span>
                  )}
                </p>
                {a.detalle && <p className="mt-0.5">{a.detalle}</p>}
                <p className="mt-0.5 text-tinta-suave">
                  {a.email}, {fechaHora(a.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-linea px-4 py-4 text-sm text-tinta-suave">
            Sin cambios hechos desde el panel.
          </p>
        )}
      </Bloque>
    </>
  );
}
