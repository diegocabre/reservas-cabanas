import Link from "next/link";
import { ESTADOS_FILTRO, hayFiltros, NOMBRE_FILTRO, type FiltrosReservas } from "@/lib/filtros-reservas";
import { formatearCLP, formatearFechaCorta } from "@/lib/formato";
import type { ReservaPanel } from "@/lib/panel";
import { tieneRevisarPago } from "@/lib/estados-reserva";
import { EtiquetaEstado } from "../resumen";

export type FilaLista = ReservaPanel & { vencida: boolean; origen: string };

const claseCampo =
  "w-full rounded-xl border border-linea bg-nieve px-3.5 py-2.5 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20";

/** URL de la lista con los filtros actuales y algún cambio (para los atajos de estado). */
function urlCon(f: FiltrosReservas, cambio: Partial<FiltrosReservas>) {
  const n = { ...f, ...cambio };
  const p = new URLSearchParams();
  if (n.estado !== "todas") p.set("estado", n.estado);
  if (n.cabana) p.set("cabana", n.cabana);
  p.set("desde", n.desde ?? "");
  if (n.hasta) p.set("hasta", n.hasta);
  if (n.q) p.set("q", n.q);
  return `/admin/reservas?${p}`;
}

export function VistaLista({
  filtros,
  hoy,
  reservas,
  hayMas,
  cabanas,
}: {
  filtros: FiltrosReservas;
  hoy: string;
  reservas: FilaLista[];
  hayMas: boolean;
  cabanas: { id: string; nombre: string; propiedad: { nombre: string } }[];
}) {
  const variasCabanas = cabanas.length > 1;
  const variasPropiedades = new Set(cabanas.map((c) => c.propiedad.nombre)).size > 1;

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Reservas</h1>

      <nav aria-label="Filtrar por estado" className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {ESTADOS_FILTRO.map((e) => (
          <Link
            key={e}
            href={urlCon(filtros, { estado: e })}
            aria-current={filtros.estado === e ? "page" : undefined}
            className="flex min-h-11 shrink-0 items-center rounded-full border border-linea bg-nieve px-4 text-sm font-semibold text-tinta-suave aria-[current=page]:border-lago aria-[current=page]:bg-lago aria-[current=page]:text-nieve"
          >
            {NOMBRE_FILTRO[e]}
          </Link>
        ))}
      </nav>

      <form method="get" action="/admin/reservas" className="mt-4 grid gap-3 rounded-2xl border border-linea bg-papel-hondo/40 p-4 sm:grid-cols-2">
        {filtros.estado !== "todas" && <input type="hidden" name="estado" value={filtros.estado} />}
        <div className="sm:col-span-2">
          <label htmlFor="q" className="mb-1 block text-sm font-semibold">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filtros.q}
            placeholder="Nombre, email o código"
            autoComplete="off"
            className={claseCampo}
          />
        </div>
        {variasCabanas && (
          <div className="sm:col-span-2">
            <label htmlFor="cabana" className="mb-1 block text-sm font-semibold">
              Cabaña
            </label>
            <select id="cabana" name="cabana" defaultValue={filtros.cabana ?? ""} className={claseCampo}>
              <option value="">Todas las cabañas</option>
              {cabanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {variasPropiedades ? `${c.propiedad.nombre}: ${c.nombre}` : c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="desde" className="mb-1 block text-sm font-semibold">
            Desde
          </label>
          <input id="desde" name="desde" type="date" defaultValue={filtros.desde ?? ""} className={claseCampo} />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1 block text-sm font-semibold">
            Hasta
          </label>
          <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta ?? ""} className={claseCampo} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            className="min-h-11 rounded-full bg-lago px-5 font-bold text-nieve transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
          >
            Filtrar
          </button>
          {hayFiltros(filtros, hoy) && (
            <Link href="/admin/reservas" className="flex min-h-11 items-center px-3 text-sm font-semibold text-lago">
              Limpiar filtros
            </Link>
          )}
          {filtros.desde === hoy && (
            <Link href={urlCon(filtros, { desde: null })} className="flex min-h-11 items-center px-3 text-sm font-semibold text-lago">
              Ver también las pasadas
            </Link>
          )}
        </div>
      </form>

      <p className="mt-5 text-sm text-tinta-suave" aria-live="polite">
        {reservas.length === 0
          ? "No hay reservas con estos filtros."
          : `${reservas.length}${hayMas ? "+" : ""} ${reservas.length === 1 ? "reserva" : "reservas"}${filtros.desde === hoy ? " desde hoy" : ""}`}
      </p>

      {reservas.length > 0 && (
        <ul className="mt-3 divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-nieve">
          {reservas.map((r) => {
            const saldo = Math.max(0, r.total - r.pagado);
            return (
              <li key={r.codigo}>
                <Link
                  href={`/admin/reservas/${r.codigo}`}
                  className="flex items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-papel-hondo/50 focus-visible:bg-papel-hondo/50 focus-visible:outline-none"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.huesped}</p>
                    <p className="text-sm text-tinta-suave">
                      {formatearFechaCorta(String(r.checkIn))} al {formatearFechaCorta(String(r.checkOut))}
                      {variasCabanas && `, ${r.cabana}`}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <EtiquetaEstado estado={r.estado} vencida={r.vencida} />
                      {tieneRevisarPago(r.notas) && <EtiquetaEstado estado="revisar" />}
                      <span className="text-xs text-tinta-suave tabular-nums">{r.codigo}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">{formatearCLP(r.total)}</p>
                    {r.estado !== "cancelada" && (
                      <p className={`text-xs font-semibold ${saldo > 0 ? "text-fuego-hondo" : "text-musgo"}`}>
                        {saldo > 0 ? `Debe ${formatearCLP(saldo)}` : "Pagado"}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {hayMas && (
        <p className="mt-3 text-sm text-tinta-suave">Hay más reservas: acota la búsqueda con fechas o con el nombre.</p>
      )}
    </>
  );
}
