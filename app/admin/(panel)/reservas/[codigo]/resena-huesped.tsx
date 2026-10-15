"use client";

import { useActionState } from "react";
import { CALIFICACIONES, ETIQUETAS, LARGO_COMENTARIO, type Calificacion } from "@/lib/resenas-reglas";
import { accionResenaHuesped } from "./acciones";
import { botonPrincipal, claseInput, MensajeError } from "./acciones-reserva";

const chip =
  "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-linea bg-nieve px-4 text-sm font-semibold has-[:checked]:border-lago has-[:checked]:bg-lago/10 has-[:checked]:text-lago has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lago";

/** Reseña privada del huésped (se edita mientras siga retenida por el doble ciego). */
export function FormularioResenaHuesped({
  codigo,
  previa,
}: {
  codigo: string;
  previa: { calificacion: Calificacion; etiquetas: string[]; comentario: string | null } | null;
}) {
  const [estado, accion, guardando] = useActionState(accionResenaHuesped, {});

  return (
    <form action={accion} className="grid gap-4">
      <input type="hidden" name="codigo" value={codigo} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">¿Lo recomendarías a otros anfitriones?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CALIFICACIONES) as Calificacion[]).map((c) => (
            <label key={c} className={chip}>
              <input type="radio" name="calificacion" value={c} required defaultChecked={previa?.calificacion === c} className="sr-only" />
              {CALIFICACIONES[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Etiquetas (opcional)</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ETIQUETAS).map(([v, t]) => (
            <label key={v} className={chip}>
              <input type="checkbox" name="etiquetas" value={v} defaultChecked={previa?.etiquetas.includes(v)} className="sr-only" />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`comentario-huesped-${codigo}`} className="mb-1.5 block text-sm font-semibold">
          Comentario (opcional)
        </label>
        <textarea
          id={`comentario-huesped-${codigo}`}
          name="comentario"
          maxLength={LARGO_COMENTARIO}
          rows={3}
          defaultValue={previa?.comentario ?? ""}
          aria-describedby={`ayuda-huesped-${codigo}`}
          className={claseInput}
        />
        <p id={`ayuda-huesped-${codigo}`} className="mt-1 text-xs text-tinta-suave">
          Describe hechos de la estadía. Sin insultos ni datos personales de terceros: el huésped puede leerla y responderla.
        </p>
      </div>
      <MensajeError estado={estado} />
      <button type="submit" disabled={guardando} className={`${botonPrincipal} justify-self-start bg-lago`}>
        {guardando ? "Guardando…" : previa ? "Guardar cambios" : "Guardar reseña"}
      </button>
    </form>
  );
}
