"use client";

import { useActionState, useState } from "react";
import { CATEGORIAS, LARGO_COMENTARIO, type ClaveCategoria, type Notas } from "@/lib/resenas-reglas";
import { accionEnviarResena, type EstadoResena } from "./acciones";

const claseInput =
  "w-full rounded-xl border border-linea bg-papel px-3.5 py-3 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20";

function Estrella({ llena }: { llena: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`size-9 transition-colors ${llena ? "fill-madera text-madera" : "fill-transparent text-linea"}`}>
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
      />
    </svg>
  );
}

/**
 * Estrellas de 1 a 5 como radios nativos: se eligen con el teclado (Tab entra al grupo, las flechas
 * cambian la nota) y cada opción se anuncia como "4 de 5 estrellas".
 */
function Estrellas({ clave, nombre, valor, cambiar }: { clave: ClaveCategoria; nombre: string; valor: number; cambiar: (v: number) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <legend className="float-left font-semibold">{nombre}</legend>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded-lg p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lago">
            <input
              type="radio"
              name={clave}
              value={n}
              required
              checked={valor === n}
              onChange={() => cambiar(n)}
              className="sr-only"
            />
            <span className="sr-only">
              {n} de 5 estrellas
            </span>
            <Estrella llena={n <= valor} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FormularioResena({ token, previa }: { token: string; previa: (Notas & { comentario: string }) | null }) {
  const [estado, accion, enviando] = useActionState<EstadoResena, FormData>(accionEnviarResena, {});
  const [notas, setNotas] = useState<Record<ClaveCategoria, number>>(
    () => Object.fromEntries(CATEGORIAS.map((c) => [c.clave, previa?.[c.clave] ?? 0])) as Record<ClaveCategoria, number>,
  );
  const [largo, setLargo] = useState(previa?.comentario.length ?? 0);

  return (
    <form action={accion} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-3">
        {CATEGORIAS.map((c) => (
          <Estrellas key={c.clave} clave={c.clave} nombre={c.nombre} valor={notas[c.clave]} cambiar={(v) => setNotas({ ...notas, [c.clave]: v })} />
        ))}
      </div>

      <div>
        <label htmlFor="comentario" className="mb-1.5 block font-semibold">
          Tu comentario
        </label>
        <textarea
          id="comentario"
          name="comentario"
          required
          minLength={10}
          maxLength={LARGO_COMENTARIO}
          rows={5}
          defaultValue={previa?.comentario}
          onChange={(e) => setLargo(e.target.value.length)}
          aria-describedby="ayuda-comentario"
          placeholder="¿Qué fue lo que más te gustó? ¿Algo que mejorarías?"
          className={claseInput}
        />
        <p id="ayuda-comentario" className="mt-1 flex justify-between gap-3 text-xs text-tinta-suave">
          <span>Cuenta tu experiencia. Evita datos personales de otras personas.</span>
          <span className="tabular-nums">
            {largo}/{LARGO_COMENTARIO}
          </span>
        </p>
      </div>

      {estado.error && (
        <p role="alert" className="rounded-2xl bg-alerta/10 px-4 py-3 text-sm font-semibold text-alerta-hondo">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-full bg-fuego px-6 py-3.5 font-bold text-nieve transition-[background-color,transform] hover:bg-fuego-hondo active:scale-[0.98] disabled:opacity-70"
      >
        {enviando ? "Enviando…" : previa ? "Guardar cambios" : "Enviar mi reseña"}
      </button>
    </form>
  );
}
