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

/** Modo prueba con datos de ejemplo: avisa qué falta confirmar antes de publicar de verdad. */
export function AvisoPendientes({ pendientes, className = "" }: { pendientes: string[]; className?: string }) {
  if (pendientes.length === 0) return null;
  return (
    <div role="note" className={`rounded-2xl border border-dashed border-fuego/40 bg-fuego/5 px-4 py-3 text-sm ${className}`}>
      <p className="font-bold text-fuego-hondo">Datos de ejemplo (PENDIENTE)</p>
      <p className="mt-0.5 text-tinta-suave">
        Faltan por confirmar: {pendientes.join(", ")}. Mientras falten, fuera del modo prueba esta cabaña no se publica ni
        cobra.
      </p>
    </div>
  );
}

/** La propiedad no puede publicarse ni cobrar (datos PENDIENTE fuera del modo prueba). */
export function BloqueoPublicacion({ mensaje, className = "" }: { mensaje: string; className?: string }) {
  return (
    <div role="alert" className={`rounded-3xl border border-linea bg-nieve px-5 py-6 text-center ${className}`}>
      <p className="font-display text-xl font-semibold text-tinta">Cabaña en preparación</p>
      <p className="mt-2 text-sm text-tinta-suave">{mensaje}</p>
    </div>
  );
}

/** Marca de cabaña de demostración (datos de ejemplo, no es un alojamiento real). */
export function EtiquetaDemo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full bg-tinta/70 px-2.5 py-0.5 text-[0.7rem] font-bold tracking-wide text-nieve uppercase ${className}`}
    >
      Demo
    </span>
  );
}
