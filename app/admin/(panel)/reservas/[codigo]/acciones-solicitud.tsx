"use client";

import { useActionState, useState } from "react";
import { IconoWhatsapp } from "@/components/iconos";
import type { BotonWhatsapp } from "@/lib/solicitudes";
import {
  accionAprobar,
  accionRechazar,
  accionReenviarCorreo,
  accionRenovarLink,
  accionWhatsappAbierto,
} from "./acciones";
import { botonPrincipal, botonSecundario, claseInput, Confirmacion, MensajeError } from "./acciones-reserva";

/** Aprobar o rechazar una solicitud pendiente. Se usa en el detalle y en el resumen del día. */
export function AccionesSolicitud({ codigo, huesped }: { codigo: string; huesped: string }) {
  const [abierta, setAbierta] = useState<null | "aprobar" | "rechazar">(null);
  const [aprobar, accionA, aprobando] = useActionState(accionAprobar, {});
  const [rechazar, accionR, rechazando] = useActionState(accionRechazar, {});
  const volver = (
    <button type="button" onClick={() => setAbierta(null)} className={botonSecundario}>
      Volver
    </button>
  );

  return (
    <div className="grid gap-3">
      {abierta === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAbierta("aprobar")} className={`${botonPrincipal} bg-musgo`}>
            Aprobar
          </button>
          <button type="button" onClick={() => setAbierta("rechazar")} className={`${botonSecundario} text-fuego-hondo`}>
            Rechazar
          </button>
        </div>
      )}

      {abierta === "aprobar" && (
        <Confirmacion titulo={`¿Aprobar la solicitud de ${huesped}?`}>
          <p className="text-sm text-tinta-suave">
            Creamos el link de pago y se lo enviamos por correo. Las fechas siguen retenidas hasta que pague o venza el link.
          </p>
          <form action={accionA} className="grid gap-3">
            <input type="hidden" name="codigo" value={codigo} />
            <MensajeError estado={aprobar} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={aprobando} className={`${botonPrincipal} bg-musgo`}>
                {aprobando ? "Aprobando…" : "Sí, aprobar"}
              </button>
              {volver}
            </div>
          </form>
        </Confirmacion>
      )}

      {abierta === "rechazar" && (
        <Confirmacion titulo={`¿Rechazar la solicitud de ${huesped}?`}>
          <p className="text-sm text-tinta-suave">Las fechas quedan libres y le avisamos al huésped con un correo amable.</p>
          <form action={accionR} className="grid gap-3">
            <input type="hidden" name="codigo" value={codigo} />
            <div>
              <label htmlFor={`motivo-${codigo}`} className="mb-1.5 block text-sm font-semibold">
                Mensaje para el huésped (opcional)
              </label>
              <textarea
                id={`motivo-${codigo}`}
                name="motivo"
                maxLength={500}
                rows={3}
                placeholder="Ej.: esas fechas ya las tenía comprometidas. ¡Ojalá en otra ocasión!"
                className={claseInput}
              />
            </div>
            <MensajeError estado={rechazar} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={rechazando} className={`${botonPrincipal} bg-fuego-hondo`}>
                {rechazando ? "Rechazando…" : "Sí, rechazar"}
              </button>
              {volver}
            </div>
          </form>
        </Confirmacion>
      )}
    </div>
  );
}

/**
 * Solicitud aprobada que espera el pago: enviar el link por WhatsApp (desde el WhatsApp del dueño),
 * reenviar el correo o, si el link venció, generar uno nuevo.
 */
export function AccionesPago({
  codigo,
  whatsapp,
  whatsappAbierto,
  esperandoPago,
}: {
  codigo: string;
  whatsapp: BotonWhatsapp;
  /** "dom 11 oct, 15:05" si el dueño ya abrió WhatsApp. */
  whatsappAbierto: string | null;
  esperandoPago: boolean;
}) {
  const [correo, accionC, enviando] = useActionState(accionReenviarCorreo, {});
  const [link, accionL, renovando] = useActionState(accionRenovarLink, {});

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {whatsapp.habilitado ? (
          <a
            href={whatsapp.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void accionWhatsappAbierto(codigo)}
            className={`${botonPrincipal} flex items-center gap-2 bg-musgo`}
          >
            <IconoWhatsapp className="size-5" />
            Enviar por WhatsApp
          </a>
        ) : (
          <button type="button" disabled aria-describedby={`motivo-wa-${codigo}`} className={`${botonPrincipal} flex items-center gap-2 bg-musgo`}>
            <IconoWhatsapp className="size-5" />
            Enviar por WhatsApp
          </button>
        )}
        {esperandoPago && whatsapp.habilitado && (
          <form action={accionC}>
            <input type="hidden" name="codigo" value={codigo} />
            <button type="submit" disabled={enviando} className={botonSecundario}>
              {enviando ? "Enviando…" : "Reenviar correo"}
            </button>
          </form>
        )}
        {!whatsapp.habilitado && whatsapp.puedeRenovar && (
          <form action={accionL}>
            <input type="hidden" name="codigo" value={codigo} />
            <button type="submit" disabled={renovando} className={`${botonPrincipal} bg-lago`}>
              {renovando ? "Generando…" : "Generar nuevo link"}
            </button>
          </form>
        )}
      </div>
      {!whatsapp.habilitado && (
        <p id={`motivo-wa-${codigo}`} className="text-sm text-tinta-suave">
          {whatsapp.motivo}
          {whatsapp.puedeRenovar && " Al generar uno nuevo, las fechas vuelven a quedar retenidas y le enviamos el correo al huésped."}
        </p>
      )}
      {whatsappAbierto && (
        <p className="text-sm text-tinta-suave">WhatsApp abierto el {whatsappAbierto}. No sabemos si el mensaje se envió.</p>
      )}
      <MensajeError estado={correo} />
      <MensajeError estado={link} />
    </div>
  );
}
