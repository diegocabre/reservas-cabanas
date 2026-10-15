"use client";

import { useActionState, useState } from "react";
import { ETAPAS_RESENAS, type EtapaResenas } from "@/lib/resenas-reglas";
import { botonPrincipal, botonSecundario, claseInput } from "../../(panel)/reservas/[codigo]/acciones-reserva";
import { accionResenas, accionSuspension, type EstadoPlataforma } from "./acciones";

function Mensaje({ estado }: { estado: EstadoPlataforma }) {
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

/** Reseñas de la propiedad: se guarda al elegir. */
export function SelectorResenas({ propiedadId, etapa }: { propiedadId: string; etapa: EtapaResenas }) {
  const [estado, accion, guardando] = useActionState(accionResenas, {});
  return (
    <form action={accion} className="grid gap-2">
      <input type="hidden" name="propiedadId" value={propiedadId} />
      <label htmlFor={`resenas-${propiedadId}`} className="text-sm font-semibold">
        Reseñas
      </label>
      <div className="flex flex-wrap gap-2">
        <select id={`resenas-${propiedadId}`} name="resenas" defaultValue={etapa} className={`${claseInput} w-auto flex-1`}>
          {(Object.keys(ETAPAS_RESENAS) as EtapaResenas[]).map((e) => (
            <option key={e} value={e}>
              {ETAPAS_RESENAS[e]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={guardando} className={botonSecundario}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <Mensaje estado={estado} />
    </form>
  );
}

/** Suspender (con confirmación, avisando las reservas vigentes) o reactivar. */
export function BotonSuspension({
  propiedadId,
  nombre,
  suspendida,
  reservasVigentes,
}: {
  propiedadId: string;
  nombre: string;
  suspendida: boolean;
  reservasVigentes: number;
}) {
  const [estado, accion, guardando] = useActionState(accionSuspension, {});
  const [confirmar, setConfirmar] = useState(false);

  if (suspendida) {
    return (
      <form action={accion} className="grid gap-2">
        <input type="hidden" name="propiedadId" value={propiedadId} />
        <input type="hidden" name="suspender" value="no" />
        <button type="submit" disabled={guardando} className={`${botonPrincipal} justify-self-start bg-musgo`}>
          {guardando ? "Reactivando…" : "Reactivar"}
        </button>
        <Mensaje estado={estado} />
      </form>
    );
  }
  return (
    <div className="grid gap-2">
      {!confirmar ? (
        <button type="button" onClick={() => setConfirmar(true)} className={`${botonSecundario} justify-self-start text-fuego-hondo`}>
          Suspender
        </button>
      ) : (
        <form action={accion} className="grid gap-3 rounded-2xl border border-fuego/30 bg-fuego/5 p-3">
          <input type="hidden" name="propiedadId" value={propiedadId} />
          <input type="hidden" name="suspender" value="si" />
          <p className="text-sm">
            <strong>{nombre}</strong> dejará de aparecer en el sitio, no recibirá reservas y sus administradores no podrán entrar al panel.
          </p>
          {reservasVigentes > 0 && (
            <p className="text-sm font-semibold text-alerta-hondo">
              Tiene {reservasVigentes} {reservasVigentes === 1 ? "reserva que aún no termina" : "reservas que aún no terminan"}: el dueño
              no podrá gestionarlas desde el panel mientras esté suspendida.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={guardando} className={`${botonPrincipal} bg-fuego-hondo`}>
              {guardando ? "Suspendiendo…" : "Sí, suspender"}
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className={botonSecundario}>
              Volver
            </button>
          </div>
        </form>
      )}
      <Mensaje estado={estado} />
    </div>
  );
}
