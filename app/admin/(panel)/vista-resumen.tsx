import Link from "next/link";
import { NOMBRE_ESTADO } from "@/lib/estados-reserva";
import { formatearCLP, formatearDiaLargo, formatearFechaCorta } from "@/lib/formato";
import { describirRango, nombreMotivo } from "@/lib/bloqueos";
import {
  bloqueosEnPeriodo,
  enCasa,
  llegadas,
  ocupacion,
  ocupacionPorDia,
  porRevisarPago,
  salidas,
  saldosPorCobrar,
  type BloqueoPanel,
  type ReservaPanel,
} from "@/lib/panel";
import type { PropiedadAdmin } from "@/lib/panel-acceso";
import { DIAS_RESUMEN } from "@/lib/panel-datos";
import { FilaReserva, Lista, Seccion, TarjetaLlegada, TiraOcupacion, Vacio } from "./resumen";
import { SeccionSolicitudes, type SolicitudResumen } from "./solicitudes";


export interface PropsResumen {
  /** Día en Chile, "YYYY-MM-DD". */
  hoy: string;
  propiedad: string;
  /** Datos de la propiedad que faltan confirmar (lib/publicacion.ts). */
  pendientes: string[];
  modoPrueba: boolean;
  reservas: ReservaPanel[];
  /** Bloqueos de fechas de la propiedad que tocan los próximos días. */
  bloqueos: BloqueoPanel[];
  cabanasActivas: number;
  propiedades: Pick<PropiedadAdmin, "id" | "nombre" | "slug">[];
  elegidaId: string;
  /** Solicitudes por responder y aprobadas por pagar (cabañas con aprobación manual). */
  solicitudes?: SolicitudResumen[];
  cabanasSinAprobacionConSolicitudes?: string[];
}

/** Resumen del día de una propiedad, a partir de datos ya cargados y filtrados por el servidor. */
export function VistaResumen({
  hoy,
  propiedad,
  pendientes,
  modoPrueba,
  reservas,
  bloqueos,
  cabanasActivas,
  propiedades,
  elegidaId,
  solicitudes = [],
  cabanasSinAprobacionConSolicitudes = [],
}: PropsResumen) {
  const revisar = porRevisarPago(reservas);
  const llegaHoy = llegadas(reservas, hoy);
  const seVaHoy = salidas(reservas, hoy);
  const alojados = enCasa(reservas, hoy);
  const proximaLlegada = llegadas(reservas, hoy, DIAS_RESUMEN).find((r) => String(r.checkIn) > hoy);
  const saldos = saldosPorCobrar(reservas);
  const totalSaldos = saldos.reduce((s, r) => s + r.saldo, 0);
  // Con una sola cabaña, repetir su nombre en cada fila no aporta: se nombra solo si hay varias.
  const variasCabanas = cabanasActivas > 1;
  const conCabana = (r: ReservaPanel, texto: string) => (variasCabanas ? `${r.cabana}, ${texto}` : texto);
  const personas = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;
  const bloqueosProximos = bloqueosEnPeriodo(bloqueos, hoy, DIAS_RESUMEN);

  return (
    <>
      <header>
        <p className="text-sm font-semibold text-tinta-suave first-letter:uppercase">{formatearDiaLargo(hoy)}</p>
        <h1 className="mt-0.5 font-display text-3xl font-semibold text-balance">{propiedad}</h1>
        {propiedades.length > 1 && (
          <nav aria-label="Propiedades" className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {propiedades.map((p) => (
              <Link
                key={p.id}
                href={{ pathname: "/admin", query: { propiedad: p.slug } }}
                aria-current={p.id === elegidaId ? "page" : undefined}
                className="shrink-0 rounded-full border border-linea px-3.5 py-1.5 text-sm font-semibold text-tinta-suave aria-[current=page]:border-lago aria-[current=page]:bg-lago aria-[current=page]:text-nieve"
              >
                {p.nombre}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <SeccionSolicitudes
        solicitudes={solicitudes}
        cabanasSinAprobacion={cabanasSinAprobacionConSolicitudes}
        variasCabanas={cabanasActivas > 1}
      />

      {revisar.length > 0 && (
        <section aria-labelledby="titulo-revisar" className="mt-6 rounded-2xl border border-fuego/40 bg-fuego/10 p-4">
          <h2 id="titulo-revisar" className="font-bold text-fuego-hondo">
            {revisar.length === 1 ? "Un pago necesita revisión" : `${revisar.length} pagos necesitan revisión`}
          </h2>
          <p className="mt-0.5 text-sm text-tinta-suave">
            Mercado Pago cobró, pero la reserva no se pudo confirmar sola. Revisa el pago y, si corresponde, devuélvelo.
          </p>
          <ul className="mt-3 grid gap-2">
            {revisar.map((r) => (
              <li key={r.codigo} className="rounded-xl bg-nieve px-3.5 py-3 text-sm">
                <Link href={`/admin/reservas/${r.codigo}`} className="font-bold underline-offset-4 hover:underline">
                  {r.huesped} <span className="font-semibold text-tinta-suave">· {r.codigo}</span>
                </Link>
                <p className="text-tinta-suave">
                  {conCabana(r, `llegada ${formatearFechaCorta(String(r.checkIn))}, reserva ${NOMBRE_ESTADO[r.estado].toLowerCase()}`)}
                </p>
                {r.revisarPagoMotivo?.split("\n").map((l) => (
                  <p key={l} className="mt-1 text-tinta">
                    {l}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendientes.length > 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-linea px-4 py-3 text-sm text-tinta-suave">
          {modoPrueba ? "Modo prueba. " : ""}
          Falta confirmar: <strong className="text-tinta">{pendientes.join(", ")}</strong>. Sin esos datos la cabaña no
          recibe reservas reales.
        </p>
      )}

      <Seccion titulo="Llegan hoy" cantidad={llegaHoy.length}>
        {llegaHoy.length ? (
          <ul className="grid gap-3">
            {llegaHoy.map((r) => (
              <TarjetaLlegada key={r.codigo} reserva={r} propiedad={propiedad} mostrarCabana={variasCabanas} />
            ))}
          </ul>
        ) : (
          <Vacio>
            Nadie llega hoy.
            {proximaLlegada &&
              ` La próxima llegada es el ${formatearFechaCorta(String(proximaLlegada.checkIn))}: ${proximaLlegada.huesped}.`}
          </Vacio>
        )}
      </Seccion>

      <Seccion titulo="Se van hoy" cantidad={seVaHoy.length}>
        {seVaHoy.length ? (
          <Lista>
            {seVaHoy.map((r) => (
              <FilaReserva key={r.codigo} reserva={r} detalle={conCabana(r, `llegó el ${formatearFechaCorta(String(r.checkIn))}`)} />
            ))}
          </Lista>
        ) : (
          <Vacio>Nadie se va hoy.</Vacio>
        )}
      </Seccion>

      <Seccion titulo="Alojados esta noche" cantidad={alojados.length}>
        {alojados.length ? (
          <Lista>
            {alojados.map((r) => (
              <FilaReserva
                key={r.codigo}
                reserva={r}
                detalle={conCabana(r, personas(r.personas))}
                derecha={
                  <span className="shrink-0 text-right text-sm text-tinta-suave">
                    Sale el
                    <span className="block font-semibold text-tinta">{formatearFechaCorta(String(r.checkOut))}</span>
                  </span>
                }
              />
            ))}
          </Lista>
        ) : (
          <Vacio>{variasCabanas ? "Las cabañas están libres esta noche." : "La cabaña está libre esta noche."}</Vacio>
        )}
      </Seccion>

      <Seccion titulo="Saldos por cobrar">
        {saldos.length ? (
          <>
            <p className="mb-3 text-sm text-tinta-suave">
              Total: <strong className="text-base text-tinta tabular-nums">{formatearCLP(totalSaldos)}</strong> en{" "}
              {saldos.length} {saldos.length === 1 ? "reserva" : "reservas"}
            </p>
            <Lista>
              {saldos.map((r) => (
                <FilaReserva
                  key={r.codigo}
                  reserva={r}
                  detalle={conCabana(r, `${String(r.checkIn) <= hoy ? "llegó" : "llega"} el ${formatearFechaCorta(String(r.checkIn))}`)}
                />
              ))}
            </Lista>
          </>
        ) : (
          <Vacio>No hay saldos pendientes en las reservas confirmadas.</Vacio>
        )}
      </Seccion>

      <Seccion titulo={`Próximos ${DIAS_RESUMEN} días`}>
        <TiraOcupacion
          dias={ocupacionPorDia(reservas, hoy, DIAS_RESUMEN, bloqueos)}
          cabanas={cabanasActivas}
          resumen={ocupacion(reservas, hoy, DIAS_RESUMEN, cabanasActivas, bloqueos)}
        />
      </Seccion>

      <Seccion titulo="Fechas bloqueadas" cantidad={bloqueosProximos.length}>
        {bloqueosProximos.length ? (
          <Lista>
            {bloqueosProximos.map((b) => (
              <li key={b.id ?? `${b.cabana}-${String(b.desde)}`} className="px-4 py-3">
                <p className="font-semibold">{nombreMotivo(b.motivo)}</p>
                <p className="text-sm text-tinta-suave">
                  {variasCabanas && `${b.cabana}, `}
                  {describirRango(b, formatearFechaCorta)}
                </p>
              </li>
            ))}
          </Lista>
        ) : (
          <Vacio>No hay fechas bloqueadas en los próximos {DIAS_RESUMEN} días.</Vacio>
        )}
        <Link href="/admin/bloqueos" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-lago">
          Bloquear o liberar fechas
        </Link>
      </Seccion>
    </>
  );
}
