"use client";

import { cloneElement, useActionState, useMemo, useState } from "react";
import { crearReserva, type EstadoFormulario } from "@/app/reservar/[propiedad]/[cabana]/acciones";
import { Calendario, type Fechas } from "@/components/reserva/calendario";
import { formatearCLP, formatearFechaCorta } from "@/lib/formato";
import {
  agruparNoches,
  calcularAbono,
  calcularPrecio,
  MinimoNochesError,
  NocheSinTemporadaError,
  TemporadasTraslapadasError,
  type TramoCotizado,
} from "@/lib/precios";
import { esquemaReserva } from "@/lib/reserva-esquema";
import type { DatosCalendario } from "@/lib/reservas";

type Cotizacion =
  | { ok: true; noches: number; tramos: TramoCotizado[]; total: number; abono: number }
  | { ok: false; error: string };

function cotizar(datos: DatosCalendario, checkIn: string, checkOut: string): Cotizacion {
  try {
    const c = calcularPrecio({
      cabana: { nombre: datos.nombre, minNoches: datos.minNoches },
      temporadas: datos.temporadas,
      checkIn,
      checkOut,
    });
    return {
      ok: true,
      noches: c.noches,
      tramos: agruparNoches(c.detalle),
      total: c.total,
      abono: calcularAbono(c.total, datos.propiedad.abonoPct),
    };
  } catch (e) {
    if (e instanceof MinimoNochesError) return { ok: false, error: e.message };
    if (e instanceof NocheSinTemporadaError) {
      return { ok: false, error: `Todavía no hay precios para la noche del ${formatearFechaCorta(e.fecha)}. Prueba con otras fechas.` };
    }
    if (e instanceof TemporadasTraslapadasError) {
      return { ok: false, error: "No pudimos calcular el precio de esas fechas. Escríbele a la cabaña para reservar." };
    }
    throw e;
  }
}

export function FormularioReserva({ datos }: { datos: DatosCalendario }) {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(crearReserva, {});
  const [fechas, setFechas] = useState<Fechas>(() => ({
    checkIn: estado.valores?.checkIn,
    checkOut: estado.valores?.checkOut,
  }));
  const [adultos, setAdultos] = useState(2);
  const [ninos, setNinos] = useState(0);
  const [erroresCliente, setErroresCliente] = useState<EstadoFormulario["errores"]>();

  const cotizacion = useMemo(
    () => (fechas.checkIn && fechas.checkOut ? cotizar(datos, fechas.checkIn, fechas.checkOut) : null),
    [datos, fechas],
  );
  const listo = cotizacion?.ok === true;
  const errores = erroresCliente ?? estado.errores;
  const valor = (campo: string) => estado.valores?.[campo] ?? "";

  // Valida con el mismo esquema que el servidor antes de enviar.
  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    const datosForm = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const r = esquemaReserva.safeParse(datosForm);
    if (!r.success) {
      e.preventDefault();
      const porCampo: Record<string, string[]> = {};
      for (const issue of r.error.issues) {
        const campo = String(issue.path[0] ?? "general");
        (porCampo[campo] ??= []).push(issue.message);
      }
      setErroresCliente(porCampo);
      document.querySelector(`[name="${Object.keys(porCampo)[0]}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      setErroresCliente(undefined);
    }
  }

  return (
    <form action={accion} onSubmit={alEnviar} noValidate className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <input type="hidden" name="propiedad" value={datos.propiedad.slug} />
      <input type="hidden" name="cabana" value={datos.slug} />
      <input type="hidden" name="checkIn" value={fechas.checkIn ?? ""} />
      <input type="hidden" name="checkOut" value={fechas.checkOut ?? ""} />

      <div className="md:grid md:grid-cols-[1fr_22rem] md:gap-10">
        <div>
          {/* Paso 1: fechas */}
          <section aria-labelledby="titulo-fechas" className="rounded-3xl border border-linea bg-nieve p-4 md:p-6">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 id="titulo-fechas" className="font-display text-xl font-semibold">
                <span className="text-madera">1.</span> Elige tus fechas
              </h2>
              {fechas.checkIn && (
                <button
                  type="button"
                  onClick={() => setFechas({})}
                  className="text-sm font-semibold text-lago underline decoration-lago/30 underline-offset-4"
                >
                  Borrar fechas
                </button>
              )}
            </div>
            <p className="mt-1 px-1 text-sm text-tinta-suave" aria-live="polite">
              {!fechas.checkIn
                ? "Toca el día de llegada."
                : !fechas.checkOut
                  ? `Llegada ${formatearFechaCorta(fechas.checkIn)}. Ahora toca el día de salida.`
                  : `${formatearFechaCorta(fechas.checkIn)} → ${formatearFechaCorta(fechas.checkOut)}`}
            </p>
            <div className="mt-3">
              <Calendario
                checkIn={fechas.checkIn}
                checkOut={fechas.checkOut}
                ocupadas={datos.ocupadas}
                hoy={datos.hoy}
                ultimoDia={datos.ultimoDia}
                onCambio={setFechas}
              />
            </div>
            <p className="mt-2 text-center text-xs text-tinta-suave">
              <span className="line-through">15</span> = ocupado · Mínimo {datos.minNoches} noches (varía por temporada)
            </p>
            {errores?.checkIn && <p className="mt-2 text-center text-sm font-semibold text-fuego-hondo">{errores.checkIn[0]}</p>}
          </section>

          {/* Paso 2: datos del huésped */}
          <section
            id="datos"
            aria-labelledby="titulo-datos"
            className={`mt-6 scroll-mt-4 rounded-3xl border border-linea bg-nieve p-5 md:p-6 ${listo ? "" : "opacity-60"}`}
          >
            <h2 id="titulo-datos" className="font-display text-xl font-semibold">
              <span className="text-madera">2.</span> Tus datos
            </h2>
            {!listo && <p className="mt-1 text-sm text-tinta-suave">Primero elige fechas disponibles.</p>}

            <fieldset disabled={!listo || enviando} className="mt-4 grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Adultos" nombre="adultos" errores={errores}>
                  <select
                    id="adultos"
                    name="adultos"
                    value={adultos}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setAdultos(n);
                      setNinos((x) => Math.min(x, datos.capacidad - n));
                    }}
                    className={claseInput}
                  >
                    {Array.from({ length: datos.capacidad }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Niños" nombre="ninos" errores={errores}>
                  <select id="ninos" name="ninos" value={ninos} onChange={(e) => setNinos(Number(e.target.value))} className={claseInput}>
                    {Array.from({ length: datos.capacidad - adultos + 1 }, (_, i) => i).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <p className="-mt-2 text-xs text-tinta-suave">Máximo {datos.capacidad} personas en total.</p>

              <Campo etiqueta="Nombre y apellido" nombre="nombre" errores={errores}>
                <input id="nombre" name="nombre" autoComplete="name" defaultValue={valor("nombre")} className={claseInput} />
              </Campo>
              <Campo etiqueta="RUT" nombre="rut" errores={errores} ayuda="Lo pide la cabaña para el registro de huéspedes.">
                <input id="rut" name="rut" inputMode="text" placeholder="12.345.678-5" defaultValue={valor("rut")} className={claseInput} />
              </Campo>
              <Campo etiqueta="Email" nombre="email" errores={errores} ayuda="Aquí te llegará la confirmación.">
                <input id="email" name="email" type="email" autoComplete="email" defaultValue={valor("email")} className={claseInput} />
              </Campo>
              <Campo etiqueta="Celular" nombre="telefono" errores={errores}>
                <input
                  id="telefono"
                  name="telefono"
                  type="tel"
                  autoComplete="tel"
                  placeholder="9 1234 5678"
                  defaultValue={valor("telefono")}
                  className={claseInput}
                />
              </Campo>
              <Campo etiqueta="Comentarios (opcional)" nombre="notas" errores={errores}>
                <textarea id="notas" name="notas" rows={3} defaultValue={valor("notas")} className={claseInput} />
              </Campo>

              {estado.error && (
                <p role="alert" className="rounded-2xl bg-fuego/10 px-4 py-3 text-sm font-semibold text-fuego-hondo">
                  {estado.error}
                </p>
              )}

              <button
                type="submit"
                className="mt-1 rounded-full bg-fuego px-6 py-4 text-lg font-bold text-nieve shadow-[0_6px_20px_-6px_var(--fuego)] transition-colors hover:bg-fuego-hondo disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando ? "Reservando…" : "Reservar"}
              </button>
              <p className="-mt-2 text-center text-xs text-tinta-suave">
                Tus fechas quedan apartadas 30 minutos mientras pagas el abono.
              </p>
            </fieldset>
          </section>
        </div>

        {/* Resumen: tarjeta lateral en escritorio, debajo del calendario en celular. */}
        <aside className="mt-6 md:mt-0">
          <div className="vetas rounded-3xl border border-linea bg-nieve p-5 md:sticky md:top-6 md:p-6">
            <Resumen cotizacion={cotizacion} fechas={fechas} abonoPct={datos.propiedad.abonoPct} />
          </div>
        </aside>
      </div>

      {/* Celular: barra fija con el total. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-linea bg-nieve/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
          {listo ? (
            <p className="leading-tight">
              <span className="font-display text-2xl font-semibold">{formatearCLP(cotizacion.total)}</span>
              <span className="block text-xs text-tinta-suave">
                {cotizacion.noches} {cotizacion.noches === 1 ? "noche" : "noches"} · abono {formatearCLP(cotizacion.abono)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-tinta-suave">{cotizacion?.ok === false ? "Revisa las fechas" : "Elige tus fechas"}</p>
          )}
          <a
            href="#datos"
            aria-disabled={!listo}
            className={`shrink-0 rounded-full px-6 py-3.5 font-bold text-nieve ${listo ? "bg-fuego" : "pointer-events-none bg-tinta/30"}`}
          >
            Continuar
          </a>
        </div>
      </div>
    </form>
  );
}

const claseInput =
  "w-full rounded-xl border border-linea bg-papel px-3.5 py-3 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20 aria-invalid:border-fuego";

function Campo({
  etiqueta,
  nombre,
  ayuda,
  errores,
  children,
}: {
  etiqueta: string;
  nombre: string;
  ayuda?: string;
  errores?: EstadoFormulario["errores"];
  children: React.ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>;
}) {
  const error = errores?.[nombre]?.[0];
  return (
    <div>
      <label htmlFor={nombre} className="mb-1.5 block text-sm font-semibold text-tinta">
        {etiqueta}
      </label>
      {cloneElement(children, { "aria-invalid": Boolean(error), "aria-describedby": error ? `${nombre}-error` : undefined })}
      {error ? (
        <p id={`${nombre}-error`} className="mt-1 text-sm font-semibold text-fuego-hondo">
          {error}
        </p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-tinta-suave">{ayuda}</p>
      )}
    </div>
  );
}

function Resumen({ cotizacion, fechas, abonoPct }: { cotizacion: Cotizacion | null; fechas: Fechas; abonoPct: number }) {
  return (
    <>
      <h2 className="font-display text-lg font-semibold">Tu estadía</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-papel-hondo px-3 py-2">
          <dt className="text-xs text-tinta-suave">Llegada</dt>
          <dd className="font-semibold">{fechas.checkIn ? formatearFechaCorta(fechas.checkIn) : "—"}</dd>
        </div>
        <div className="rounded-2xl bg-papel-hondo px-3 py-2">
          <dt className="text-xs text-tinta-suave">Salida</dt>
          <dd className="font-semibold">{fechas.checkOut ? formatearFechaCorta(fechas.checkOut) : "—"}</dd>
        </div>
      </dl>

      {cotizacion?.ok === false && (
        <p role="alert" className="mt-4 rounded-2xl bg-fuego/10 px-4 py-3 text-sm font-semibold text-fuego-hondo">
          {cotizacion.error}
        </p>
      )}

      {cotizacion?.ok && (
        <>
          <ul className="mt-4 space-y-1.5 text-sm">
            {cotizacion.tramos.map((t, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-tinta-suave">
                  {t.noches} {t.noches === 1 ? "noche" : "noches"} × {formatearCLP(t.precioNoche)}
                  <span className="block text-xs">Temporada {t.temporada.toLowerCase()}</span>
                </span>
                <span>{formatearCLP(t.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1.5 border-t border-linea pt-4">
            <p className="flex justify-between font-display text-xl font-semibold">
              <span>Total</span>
              <span>{formatearCLP(cotizacion.total)}</span>
            </p>
            <p className="flex justify-between text-sm font-semibold text-lago">
              <span>Abono para reservar ({abonoPct}%)</span>
              <span>{formatearCLP(cotizacion.abono)}</span>
            </p>
            <p className="flex justify-between text-sm text-tinta-suave">
              <span>Saldo pendiente</span>
              <span>{formatearCLP(cotizacion.total - cotizacion.abono)}</span>
            </p>
          </div>
        </>
      )}

      {!cotizacion && <p className="mt-4 text-sm text-tinta-suave">Elige llegada y salida para ver el precio.</p>}
    </>
  );
}
