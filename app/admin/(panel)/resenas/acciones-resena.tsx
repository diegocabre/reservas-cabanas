"use client";

import { useActionState, useState } from "react";
import { LARGO_COMENTARIO, MOTIVOS_REPORTE } from "@/lib/resenas-reglas";
import { botonPrincipal, botonSecundario, claseInput } from "../reservas/[codigo]/acciones-reserva";
import { accionReportar, accionResponder, type EstadoAccionResena } from "./acciones";

function Mensaje({ estado }: { estado: EstadoAccionResena }) {
  if (estado.error)
    return (
      <p role="alert" className="rounded-xl bg-fuego/10 px-3.5 py-2.5 text-sm font-semibold text-fuego-hondo">
        {estado.error}
      </p>
    );
  if (estado.hecho)
    return (
      <p role="status" className="rounded-xl bg-musgo/15 px-3.5 py-2.5 text-sm font-semibold text-musgo">
        {estado.hecho}
      </p>
    );
  return null;
}

/** Responder (o editar la respuesta, dentro del plazo) y reportar una reseña publicada. */
export function AccionesResena({
  resenaId,
  respuesta,
  respuestaEditable,
  reportada,
}: {
  resenaId: string;
  respuesta: string | null;
  respuestaEditable: boolean;
  reportada: boolean;
}) {
  const [abierta, setAbierta] = useState<null | "responder" | "reportar">(null);
  const [resp, accionR, respondiendo] = useActionState(accionResponder, {});
  const [rep, accionX, reportando] = useActionState(accionReportar, {});
  const volver = (
    <button type="button" onClick={() => setAbierta(null)} className={botonSecundario}>
      Volver
    </button>
  );

  return (
    <div className="mt-3 grid gap-3">
      <Mensaje estado={abierta === "reportar" ? rep : resp} />
      {abierta === null && (
        <div className="flex flex-wrap gap-2">
          {respuestaEditable && (
            <button type="button" onClick={() => setAbierta("responder")} className={`${botonPrincipal} bg-lago`}>
              {respuesta ? "Editar respuesta" : "Responder"}
            </button>
          )}
          {!reportada && (
            <button type="button" onClick={() => setAbierta("reportar")} className={botonSecundario}>
              Reportar
            </button>
          )}
        </div>
      )}

      {abierta === "responder" && (
        <form action={accionR} className="grid gap-3">
          <input type="hidden" name="resenaId" value={resenaId} />
          <label htmlFor={`respuesta-${resenaId}`} className="text-sm font-semibold">
            Tu respuesta pública
          </label>
          <textarea
            id={`respuesta-${resenaId}`}
            name="texto"
            required
            maxLength={LARGO_COMENTARIO}
            rows={4}
            defaultValue={respuesta ?? ""}
            className={claseInput}
          />
          <p className="text-xs text-tinta-suave">La ve cualquiera en la página de la cabaña. Puedes editarla durante 14 días.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={respondiendo} className={`${botonPrincipal} bg-lago`}>
              {respondiendo ? "Publicando…" : "Publicar respuesta"}
            </button>
            {volver}
          </div>
        </form>
      )}

      {abierta === "reportar" && (
        <form action={accionX} className="grid gap-3">
          <input type="hidden" name="resenaId" value={resenaId} />
          <p className="text-sm text-tinta-suave">
            No puedes borrar ni editar reseñas. Si esta tiene insultos, datos personales o no corresponde, repórtala: el equipo
            de la plataforma la revisa y puede ocultarla.
          </p>
          <label htmlFor={`motivo-${resenaId}`} className="text-sm font-semibold">
            Motivo
          </label>
          <select id={`motivo-${resenaId}`} name="motivo" required defaultValue="" className={claseInput}>
            <option value="" disabled>
              Elige un motivo
            </option>
            {Object.entries(MOTIVOS_REPORTE).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <label htmlFor={`detalle-${resenaId}`} className="text-sm font-semibold">
            Detalle (opcional)
          </label>
          <textarea id={`detalle-${resenaId}`} name="detalle" maxLength={500} rows={2} className={claseInput} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={reportando} className={`${botonPrincipal} bg-fuego-hondo`}>
              {reportando ? "Enviando…" : "Enviar reporte"}
            </button>
            {volver}
          </div>
        </form>
      )}
    </div>
  );
}
