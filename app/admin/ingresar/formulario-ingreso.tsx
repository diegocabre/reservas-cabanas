"use client";

import { useActionState } from "react";
import { pedirLink, type EstadoIngreso } from "./acciones";

const claseInput =
  "w-full rounded-xl border border-linea bg-papel px-3.5 py-3 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20";

export function FormularioIngreso({ errorInicial }: { errorInicial: string | null }) {
  const [estado, accion, enviando] = useActionState<EstadoIngreso, FormData>(pedirLink, {});
  const error = estado.error ?? (estado.enviadoA ? null : errorInicial);

  if (estado.enviadoA) {
    return (
      <div role="status" className="text-center">
        <p className="font-display text-xl font-semibold">Revisa tu correo</p>
        <p className="mt-2 text-tinta-suave">
          Si <strong className="text-tinta">{estado.enviadoA}</strong> tiene acceso al panel, te llegará un link para
          entrar. Ábrelo en este mismo dispositivo.
        </p>
        <p className="mt-4 text-sm text-tinta-suave">¿No llega? Revisa la carpeta de spam o pide otro en unos minutos.</p>
      </div>
    );
  }

  return (
    <form action={accion} className="grid gap-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
          Tu email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          defaultValue={estado.email}
          className={claseInput}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-fuego/10 px-4 py-3 text-sm font-semibold text-fuego-hondo">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-full bg-lago px-6 py-3.5 font-bold text-nieve transition-colors hover:bg-lago/90 disabled:opacity-70"
      >
        {enviando ? "Enviando…" : "Enviarme el link"}
      </button>
    </form>
  );
}
