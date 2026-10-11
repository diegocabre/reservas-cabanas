"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { MOTIVOS_BLOQUEO, NOMBRE_MOTIVO } from "@/lib/bloqueos";
import { formatearFechaCorta } from "@/lib/formato";
import { accionCrearBloqueo, accionEliminarBloqueo, type EstadoBloqueo } from "./acciones";

const claseInput =
  "w-full rounded-xl border border-linea bg-papel px-3.5 py-3 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20";
const botonPrincipal =
  "min-h-11 rounded-full px-5 font-bold text-nieve transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-60";
const botonSecundario = "min-h-11 rounded-full border border-linea bg-nieve px-5 font-semibold text-tinta transition-colors hover:bg-papel-hondo";

/** Crear un bloqueo: cabaña, primera y última noche (inclusive) y motivo. */
export function FormularioBloqueo({ cabanas, hoy }: { cabanas: { id: string; nombre: string }[]; hoy: string }) {
  const [estado, accion, guardando] = useActionState<EstadoBloqueo, FormData>(accionCrearBloqueo, {});
  const v = estado.valores ?? {};
  const [primera, setPrimera] = useState(v.primeraNoche ?? "");

  return (
    <form action={accion} className="grid gap-4 rounded-2xl border border-linea bg-nieve p-4 sm:grid-cols-2">
      {cabanas.length > 1 ? (
        <div className="sm:col-span-2">
          <label htmlFor="cabanaId" className="mb-1.5 block text-sm font-semibold">
            Cabaña
          </label>
          <select id="cabanaId" name="cabanaId" required defaultValue={v.cabanaId ?? ""} className={claseInput}>
            <option value="" disabled>
              Elige la cabaña
            </option>
            {cabanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="cabanaId" value={cabanas[0]?.id ?? ""} />
      )}

      <div>
        <label htmlFor="primeraNoche" className="mb-1.5 block text-sm font-semibold">
          Primera noche bloqueada
        </label>
        <input
          id="primeraNoche"
          name="primeraNoche"
          type="date"
          required
          min={hoy}
          value={primera}
          onChange={(e) => setPrimera(e.target.value)}
          className={claseInput}
        />
      </div>
      <div>
        <label htmlFor="ultimaNoche" className="mb-1.5 block text-sm font-semibold">
          Última noche bloqueada
        </label>
        <input
          id="ultimaNoche"
          name="ultimaNoche"
          type="date"
          required
          min={primera || hoy}
          defaultValue={v.ultimaNoche}
          className={claseInput}
        />
        <p className="mt-1 text-xs text-tinta-suave">La mañana siguiente la cabaña queda libre para otra llegada.</p>
      </div>

      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-semibold">Motivo</legend>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS_BLOQUEO.map((m) => (
            <label
              key={m}
              className="flex min-h-11 cursor-pointer items-center rounded-full border border-linea px-4 text-sm font-semibold has-checked:border-lago has-checked:bg-lago has-checked:text-nieve has-focus-visible:ring-2 has-focus-visible:ring-lago/40"
            >
              <input type="radio" name="motivo" value={m} required defaultChecked={v.motivo === m} className="sr-only" />
              {NOMBRE_MOTIVO[m]}
            </label>
          ))}
        </div>
      </fieldset>

      {estado.error && (
        <div role="alert" className="rounded-xl bg-alerta/10 px-3.5 py-3 text-sm sm:col-span-2">
          <p className="font-semibold text-alerta-hondo">{estado.error}</p>
          {estado.conflictos && estado.conflictos.length > 0 && (
            <ul className="mt-2 grid gap-1.5">
              {estado.conflictos.map((c) => (
                <li key={c.codigo}>
                  <Link href={`/admin/reservas/${c.codigo}`} className="font-semibold text-tinta underline underline-offset-4">
                    {c.huesped}
                  </Link>{" "}
                  <span className="text-tinta-suave">
                    {c.codigo}, {formatearFechaCorta(c.desde)} al {formatearFechaCorta(c.hasta)} (
                    {c.estado === "confirmada" ? "confirmada" : "pendiente de pago"})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="sm:col-span-2">
        <button type="submit" disabled={guardando || cabanas.length === 0} className={`${botonPrincipal} bg-lago`}>
          {guardando ? "Bloqueando…" : "Bloquear fechas"}
        </button>
      </div>
    </form>
  );
}

/** Liberar un bloqueo, con paso de confirmación en pantalla. */
export function EliminarBloqueo({ id, descripcion }: { id: string; descripcion: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, eliminando] = useActionState<EstadoBloqueo, FormData>(accionEliminarBloqueo, {});

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-alerta-hondo hover:bg-alerta/10">
        Liberar
      </button>
    );
  }
  return (
    <form action={accion} className="mt-3 grid w-full gap-2 rounded-xl bg-papel-hondo/60 p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm font-semibold">¿Liberar {descripcion}? Esas noches se podrán reservar de nuevo.</p>
      {estado.error && (
        <p role="alert" className="text-sm font-semibold text-alerta-hondo">
          {estado.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={eliminando} className={`${botonPrincipal} bg-alerta-hondo`}>
          {eliminando ? "Liberando…" : "Sí, liberar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={botonSecundario}>
          Volver
        </button>
      </div>
    </form>
  );
}
