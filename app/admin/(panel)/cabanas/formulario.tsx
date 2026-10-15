"use client";

import { useActionState, useState } from "react";
import { botonPrincipal, claseInput, MensajeError } from "../reservas/[codigo]/acciones-reserva";
import { accionConfigurarCabana } from "./acciones";

export function FormularioAprobacion({
  cabana,
}: {
  cabana: { id: string; requiereAprobacion: boolean; horasRespuestaAprobacion: number; horasParaPagar: number };
}) {
  const [estado, accion, guardando] = useActionState(accionConfigurarCabana, {});
  const [activa, setActiva] = useState(cabana.requiereAprobacion);

  return (
    <form action={accion} className="grid gap-4">
      <input type="hidden" name="cabanaId" value={cabana.id} />
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="requiereAprobacion"
          checked={activa}
          onChange={(e) => setActiva(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-lago"
        />
        <span>
          <span className="block font-semibold">Aprobar reservas manualmente</span>
          <span className="block text-sm text-tinta-suave">
            El huésped envía una solicitud sin pagar. Tú la apruebas o la rechazas, y recién al aprobar le llega el link de pago.
          </span>
        </span>
      </label>

      <div className={`grid gap-3 sm:grid-cols-2 ${activa ? "" : "opacity-60"}`}>
        <div>
          <label htmlFor={`respuesta-${cabana.id}`} className="mb-1.5 block text-sm font-semibold">
            Horas para responder
          </label>
          <input
            id={`respuesta-${cabana.id}`}
            name="horasRespuestaAprobacion"
            type="number"
            inputMode="numeric"
            min={1}
            max={168}
            defaultValue={cabana.horasRespuestaAprobacion}
            className={`${claseInput} tabular-nums`}
          />
          <p className="mt-1 text-xs text-tinta-suave">Si no respondes a tiempo, la solicitud expira y las fechas se liberan.</p>
        </div>
        <div>
          <label htmlFor={`pago-${cabana.id}`} className="mb-1.5 block text-sm font-semibold">
            Horas para pagar
          </label>
          <input
            id={`pago-${cabana.id}`}
            name="horasParaPagar"
            type="number"
            inputMode="numeric"
            min={1}
            max={168}
            defaultValue={cabana.horasParaPagar}
            className={`${claseInput} tabular-nums`}
          />
          <p className="mt-1 text-xs text-tinta-suave">Vigencia del link de pago desde que apruebas.</p>
        </div>
      </div>

      <MensajeError estado={estado} />
      <div>
        <button type="submit" disabled={guardando} className={`${botonPrincipal} bg-lago`}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
