"use client";

import { useActionState, useState } from "react";
import { accionConectar, accionDesconectar, type EstadoCobros } from "./acciones";

const boton =
  "min-h-11 rounded-full px-5 font-bold text-nieve transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-60";
const botonSecundario = "min-h-11 rounded-full border border-linea bg-nieve px-5 font-semibold text-tinta transition-colors hover:bg-papel-hondo";

function MensajeError({ estado }: { estado: EstadoCobros }) {
  if (!estado.error) return null;
  return (
    <p role="alert" className="mt-2 text-sm font-semibold text-alerta-hondo">
      {estado.error}
    </p>
  );
}

/** Lleva al dueño a Mercado Pago para autorizar. */
export function BotonConectar({ propiedadId, reconectar = false }: { propiedadId: string; reconectar?: boolean }) {
  const [estado, accion, enviando] = useActionState<EstadoCobros, FormData>(accionConectar, {});
  return (
    <form action={accion}>
      <input type="hidden" name="propiedadId" value={propiedadId} />
      <button type="submit" disabled={enviando} className={reconectar ? botonSecundario : `${boton} bg-lago`}>
        {enviando ? "Abriendo Mercado Pago…" : reconectar ? "Conectar otra cuenta" : "Conectar Mercado Pago"}
      </button>
      <MensajeError estado={estado} />
    </form>
  );
}

/** Desconectar, con paso de confirmación: sin cuenta, la propiedad deja de cobrar en línea. */
export function BotonDesconectar({ propiedadId }: { propiedadId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<EstadoCobros, FormData>(accionDesconectar, {});

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-alerta-hondo hover:bg-alerta/10">
        Desconectar
      </button>
    );
  }
  return (
    <form action={accion} className="mt-3 grid gap-2 rounded-xl bg-papel-hondo/60 p-3">
      <input type="hidden" name="propiedadId" value={propiedadId} />
      <p className="text-sm font-semibold">
        ¿Desconectar Mercado Pago? Los huéspedes no podrán pagar el abono en línea hasta que conectes una cuenta de nuevo.
      </p>
      <MensajeError estado={estado} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={enviando} className={`${boton} bg-alerta-hondo`}>
          {enviando ? "Desconectando…" : "Sí, desconectar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={botonSecundario}>
          Volver
        </button>
      </div>
    </form>
  );
}
