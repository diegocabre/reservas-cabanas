"use client";

import { useActionState, useState } from "react";
import { formatearCLP } from "@/lib/formato";
import { MEDIOS_PAGO_SALDO, NOMBRE_MEDIO, type MedioPagoSaldo } from "@/lib/estados-reserva";
import { accionCancelar, accionConfirmar, accionMarcarRevisado, accionRegistrarPago, type EstadoAccion } from "./acciones";

type Abierta = null | "confirmar" | "cancelar" | "pago" | "revisado";

export const botonPrincipal =
  "min-h-11 rounded-full px-5 font-bold text-nieve transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-60";
export const botonSecundario =
  "min-h-11 rounded-full border border-linea bg-nieve px-5 font-semibold text-tinta transition-colors hover:bg-papel-hondo";
export const claseInput =
  "w-full rounded-xl border border-linea bg-papel px-3.5 py-3 text-base text-tinta outline-none transition-colors focus:border-lago focus:ring-2 focus:ring-lago/20";

export function MensajeError({ estado }: { estado: EstadoAccion }) {
  if (!estado.error) return null;
  return (
    <p role="alert" className="rounded-xl bg-fuego/10 px-3.5 py-2.5 text-sm font-semibold text-fuego-hondo">
      {estado.error}
    </p>
  );
}

/** Panel de confirmación que se abre bajo el botón de la acción. */
export function Confirmacion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-linea bg-nieve p-4">
      <p className="font-bold">{titulo}</p>
      {children}
    </div>
  );
}

export function AccionesReserva({
  codigo,
  huesped,
  saldo,
  hoy,
  puede,
}: {
  codigo: string;
  huesped: string;
  saldo: number;
  hoy: string;
  puede: { confirmar: boolean; cancelar: boolean; registrarPago: boolean; marcarRevisado: boolean };
}) {
  const [abierta, setAbierta] = useState<Abierta>(null);
  const [confirmar, accionC, confirmando] = useActionState(accionConfirmar, {});
  const [cancelar, accionX, cancelando] = useActionState(accionCancelar, {});
  const [pago, accionP, pagando] = useActionState(accionRegistrarPago, {});
  const [revisado, accionR, revisando] = useActionState(accionMarcarRevisado, {});
  // El monto se muestra con separador de miles ("180.000"); el servidor toma solo los dígitos.
  const miles = (v: string) => {
    const digitos = v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    return digitos ? Number(digitos).toLocaleString("es-CL") : "";
  };
  const [monto, setMonto] = useState(miles(String(saldo)));
  const [medio, setMedio] = useState<MedioPagoSaldo>("efectivo");

  const montoNumero = Number(monto.replace(/\D/g, "")) || 0;
  const volver = (
    <button type="button" onClick={() => setAbierta(null)} className={botonSecundario}>
      Volver
    </button>
  );

  if (!Object.values(puede).some(Boolean)) {
    return <p className="text-sm text-tinta-suave">No hay acciones disponibles para esta reserva.</p>;
  }

  return (
    <div className="grid gap-3">
      {abierta === null && (
        <div className="flex flex-wrap gap-2">
          {puede.registrarPago && (
            <button type="button" onClick={() => setAbierta("pago")} className={`${botonPrincipal} bg-lago`}>
              Registrar pago
            </button>
          )}
          {puede.confirmar && (
            <button type="button" onClick={() => setAbierta("confirmar")} className={`${botonPrincipal} bg-musgo`}>
              Confirmar reserva
            </button>
          )}
          {puede.marcarRevisado && (
            <button type="button" onClick={() => setAbierta("revisado")} className={botonSecundario}>
              Marcar pago revisado
            </button>
          )}
          {puede.cancelar && (
            <button type="button" onClick={() => setAbierta("cancelar")} className={`${botonSecundario} text-fuego-hondo`}>
              Cancelar reserva
            </button>
          )}
        </div>
      )}

      {abierta === "confirmar" && (
        <Confirmacion titulo={`¿Confirmar la reserva de ${huesped}?`}>
          <p className="text-sm text-tinta-suave">
            Las fechas quedan tomadas y le enviamos al huésped el email de confirmación. Si había un pago por revisar, queda
            marcado como revisado.
          </p>
          <form action={accionC} className="grid gap-3">
            <input type="hidden" name="codigo" value={codigo} />
            <MensajeError estado={confirmar} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={confirmando} className={`${botonPrincipal} bg-musgo`}>
                {confirmando ? "Confirmando…" : "Sí, confirmar"}
              </button>
              {volver}
            </div>
          </form>
        </Confirmacion>
      )}

      {abierta === "cancelar" && (
        <Confirmacion titulo={`¿Cancelar la reserva de ${huesped}?`}>
          <p className="text-sm text-tinta-suave">Las fechas quedan libres para otra reserva. Esto no devuelve dinero por sí solo.</p>
          <form action={accionX} className="grid gap-3">
            <input type="hidden" name="codigo" value={codigo} />
            <div>
              <label htmlFor="motivo" className="mb-1.5 block text-sm font-semibold">
                Motivo
              </label>
              <textarea
                id="motivo"
                name="motivo"
                required
                minLength={5}
                maxLength={500}
                rows={3}
                placeholder="Ej.: el huésped avisó por WhatsApp que no viene"
                className={claseInput}
              />
            </div>
            <MensajeError estado={cancelar} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={cancelando} className={`${botonPrincipal} bg-fuego-hondo`}>
                {cancelando ? "Cancelando…" : "Sí, cancelar reserva"}
              </button>
              {volver}
            </div>
          </form>
        </Confirmacion>
      )}

      {abierta === "pago" && (
        <Confirmacion titulo="Registrar un pago recibido">
          <form action={accionP} className="grid gap-4">
            <input type="hidden" name="codigo" value={codigo} />
            <div>
              <label htmlFor="monto" className="mb-1.5 block text-sm font-semibold">
                Monto
              </label>
              <input
                id="monto"
                name="monto"
                inputMode="numeric"
                required
                value={monto}
                onChange={(e) => setMonto(miles(e.target.value))}
                className={`${claseInput} tabular-nums`}
              />
              <p className="mt-1 text-xs text-tinta-suave">Falta por pagar {formatearCLP(saldo)}. No se puede registrar más que eso.</p>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">Medio de pago</legend>
              <div className="flex flex-wrap gap-2">
                {MEDIOS_PAGO_SALDO.map((m) => (
                  <label
                    key={m}
                    className="flex min-h-11 cursor-pointer items-center rounded-full border border-linea px-4 text-sm font-semibold has-checked:border-lago has-checked:bg-lago has-checked:text-nieve has-focus-visible:ring-2 has-focus-visible:ring-lago/40"
                  >
                    <input type="radio" name="medio" value={m} checked={medio === m} onChange={() => setMedio(m)} className="sr-only" />
                    {NOMBRE_MEDIO[m]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="fecha" className="mb-1.5 block text-sm font-semibold">
                Fecha del pago
              </label>
              <input id="fecha" name="fecha" type="date" required defaultValue={hoy} max={hoy} className={claseInput} />
            </div>
            <MensajeError estado={pago} />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pagando || montoNumero <= 0 || montoNumero > saldo}
                className={`${botonPrincipal} bg-lago`}
              >
                {pagando ? "Registrando…" : `Registrar ${montoNumero > 0 ? formatearCLP(montoNumero) : "pago"}`}
              </button>
              {volver}
            </div>
          </form>
        </Confirmacion>
      )}

      {abierta === "revisado" && (
        <Confirmacion titulo="¿Marcar el pago como revisado?">
          <p className="text-sm text-tinta-suave">
            El aviso desaparece del resumen y la reserva no cambia de estado. Úsalo cuando ya resolviste el pago (por ejemplo,
            lo devolviste).
          </p>
          <form action={accionR} className="grid gap-3">
            <input type="hidden" name="codigo" value={codigo} />
            <div>
              <label htmlFor="nota" className="mb-1.5 block text-sm font-semibold">
                Qué hiciste (opcional)
              </label>
              <input id="nota" name="nota" maxLength={500} placeholder="Ej.: devuelto desde Mercado Pago" className={claseInput} />
            </div>
            <MensajeError estado={revisado} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={revisando} className={`${botonPrincipal} bg-lago`}>
                {revisando ? "Guardando…" : "Sí, marcar revisado"}
              </button>
              {volver}
            </div>
          </form>
        </Confirmacion>
      )}
    </div>
  );
}
