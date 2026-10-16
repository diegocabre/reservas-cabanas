"use client";

import { CamposAntiBot } from "@/components/campos-anti-bot";
import { useActionState } from "react";
import { accionPedirAcceso, accionReplicar, accionSolicitar, type EstadoMisDatos } from "./acciones";

const claseInput =
  "w-full rounded-xl border border-linea bg-papel px-3.5 py-3 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20";
const boton =
  "rounded-full bg-fuego px-6 py-3 font-bold text-nieve transition-[background-color,transform] hover:bg-fuego-hondo active:scale-[0.98] disabled:opacity-70";

function Mensaje({ estado }: { estado: EstadoMisDatos }) {
  if (estado.error)
    return (
      <p role="alert" className="rounded-2xl bg-alerta/10 px-4 py-3 text-sm font-semibold text-alerta-hondo">
        {estado.error}
      </p>
    );
  if (estado.hecho)
    return (
      <p role="status" className="rounded-2xl bg-musgo/15 px-4 py-3 text-sm font-semibold text-musgo">
        {estado.hecho}
      </p>
    );
  return null;
}

export function FormularioPedirAcceso() {
  const [estado, accion, enviando] = useActionState<EstadoMisDatos, FormData>(accionPedirAcceso, {});
  return (
    <form action={accion} className="grid gap-4">
      <CamposAntiBot />
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
          Email con el que reservaste
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={claseInput} />
      </div>
      <Mensaje estado={estado} />
      <button type="submit" disabled={enviando} className={boton}>
        {enviando ? "Enviando…" : "Enviarme el link"}
      </button>
    </form>
  );
}

export function FormularioReplica({ token, resenaId, previa }: { token: string; resenaId: string; previa: string | null }) {
  const [estado, accion, enviando] = useActionState<EstadoMisDatos, FormData>(accionReplicar, {});
  return (
    <form action={accion} className="mt-3 grid gap-2">
      <CamposAntiBot />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="resenaId" value={resenaId} />
      <label htmlFor={`replica-${resenaId}`} className="text-sm font-semibold">
        Tu respuesta (la ven los anfitriones junto a la reseña)
      </label>
      <textarea id={`replica-${resenaId}`} name="texto" required maxLength={1000} rows={3} defaultValue={previa ?? ""} className={claseInput} />
      <Mensaje estado={estado} />
      <button type="submit" disabled={enviando} className={`${boton} justify-self-start`}>
        {enviando ? "Guardando…" : previa ? "Actualizar respuesta" : "Responder"}
      </button>
    </form>
  );
}

export function FormularioSolicitud({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState<EstadoMisDatos, FormData>(accionSolicitar, {});
  return (
    <form action={accion} className="grid gap-4">
      <CamposAntiBot />
      <input type="hidden" name="token" value={token} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">¿Qué quieres solicitar?</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="tipo" value="rectificacion" required className="size-4 accent-lago" />
          Corregir un dato o una reseña
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="tipo" value="eliminacion" className="size-4 accent-lago" />
          Eliminar mi información
        </label>
      </fieldset>
      <div>
        <label htmlFor="mensaje" className="mb-1.5 block text-sm font-semibold">
          Cuéntanos qué y por qué
        </label>
        <textarea id="mensaje" name="mensaje" required maxLength={2000} rows={4} className={claseInput} />
      </div>
      <Mensaje estado={estado} />
      <button type="submit" disabled={enviando} className={`${boton} justify-self-start`}>
        {enviando ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}
