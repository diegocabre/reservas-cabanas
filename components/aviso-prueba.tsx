/** Aviso de modo prueba: las reservas son de demostración y no se cobra nada. */
export function AvisoPrueba({ className = "" }: { className?: string }) {
  return (
    <div role="note" className={`rounded-2xl border border-dashed border-lago/40 bg-lago/5 px-4 py-3 text-sm text-lago ${className}`}>
      <p className="font-bold">Modo prueba</p>
      <p className="mt-0.5 text-tinta-suave">
        Estamos probando el sistema de reservas. Puedes recorrer todo el proceso, pero la reserva no es real y no se cobra
        nada.
      </p>
    </div>
  );
}

/** Etiqueta flotante en la esquina de un botón (el botón debe ser `relative`). No ocupa ancho. */
export function EtiquetaPrueba() {
  return (
    <span className="absolute -top-2.5 right-4 rounded-full bg-lago px-2 py-0.5 text-[0.65rem] leading-tight font-bold tracking-wide text-nieve uppercase shadow-sm">
      Prueba
    </span>
  );
}
