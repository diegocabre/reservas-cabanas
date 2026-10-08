"use client";

import { useActionState } from "react";
import { buscarReserva, type EstadoBusqueda } from "./acciones";

const claseInput =
  "w-full rounded-xl border border-linea bg-papel px-3.5 py-3 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20";

export function FormularioBusqueda() {
  const [estado, accion, buscando] = useActionState<EstadoBusqueda, FormData>(buscarReserva, {});

  return (
    <form action={accion} className="grid gap-4">
      <div>
        <label htmlFor="codigo" className="mb-1.5 block text-sm font-semibold">
          Código de reserva
        </label>
        <input
          id="codigo"
          name="codigo"
          required
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="LL-7K3QX9"
          defaultValue={estado.codigo}
          className={`${claseInput} font-semibold tracking-wider uppercase`}
        />
      </div>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
          Email con el que reservaste
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={estado.email} className={claseInput} />
      </div>

      {estado.error && (
        <p role="alert" className="rounded-2xl bg-fuego/10 px-4 py-3 text-sm font-semibold text-fuego-hondo">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={buscando}
        className="rounded-full bg-fuego px-6 py-3.5 font-bold text-nieve transition-colors hover:bg-fuego-hondo disabled:opacity-70"
      >
        {buscando ? "Buscando…" : "Ver mi reserva"}
      </button>
    </form>
  );
}
