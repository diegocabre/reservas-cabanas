// Una propiedad con datos marcados PENDIENTE (valores de ejemplo mientras el dueño los confirma)
// no puede publicarse ni cobrar. En modo prueba sí se puede probar, con un aviso.

/** Marca en un dato que todavía es un valor de ejemplo, ej. "PENDIENTE: check-in desde las 15:00". */
export const MARCA_PENDIENTE = "PENDIENTE";

const CAMPOS = {
  ubicacion: "ubicación",
  whatsapp: "WhatsApp",
  email: "email de avisos",
  instruccionesLlegada: "instrucciones de llegada y horarios de check-in/out",
  politicaCancelacion: "política de cancelación",
} as const;

export type DatosPublicacion = Record<keyof typeof CAMPOS, string | null>;

/** Datos que faltan confirmar (vacíos o marcados PENDIENTE), con su nombre para mostrar. */
export function datosPendientes(p: DatosPublicacion): string[] {
  return (Object.keys(CAMPOS) as (keyof typeof CAMPOS)[])
    .filter((campo) => {
      const valor = p[campo]?.trim();
      return !valor || valor.toUpperCase().includes(MARCA_PENDIENTE);
    })
    .map((campo) => CAMPOS[campo]);
}

/**
 * Motivo por el que la propiedad no puede publicarse ni cobrar, o null si puede.
 * En modo prueba nunca bloquea: los datos de ejemplo sirven para probar de punta a punta.
 */
export function bloqueoPublicacion(p: DatosPublicacion, modoPrueba: boolean): string | null {
  if (modoPrueba) return null;
  const faltan = datosPendientes(p);
  if (faltan.length === 0) return null;
  return `Esta cabaña todavía no recibe reservas: faltan datos por confirmar (${faltan.join(", ")}).`;
}

/** Campos de Propiedad que hay que cargar para revisar la publicación (select de Prisma). */
export const SELECT_PUBLICACION = {
  ubicacion: true,
  whatsapp: true,
  email: true,
  instruccionesLlegada: true,
  politicaCancelacion: true,
} as const;

// Las cabañas demo (cabana.demo) no existen: sirven para mostrar el sistema.
export const MENSAJE_DEMO_SIN_RESERVAS = "Esta es una cabaña de demostración: no recibe reservas reales.";
export const MENSAJE_DEMO_SIN_COBRO = "Esta es una cabaña de demostración: no se cobra ningún pago.";

type CabanaPublicacion = { demo: boolean; propiedad: DatosPublicacion };

/**
 * Motivo por el que no se puede reservar la cabaña, o null si se puede.
 * Fuera del modo prueba: las demo no reciben reservas y las propiedades con datos PENDIENTE tampoco.
 */
export function bloqueoReserva(c: CabanaPublicacion, modoPrueba: boolean): string | null {
  if (c.demo && !modoPrueba) return MENSAJE_DEMO_SIN_RESERVAS;
  return bloqueoPublicacion(c.propiedad, modoPrueba);
}

/** Motivo por el que no se puede cobrar el abono, o null si se puede. Las demo NUNCA cobran, ni en modo prueba. */
export function bloqueoCobro(c: CabanaPublicacion, modoPrueba: boolean): string | null {
  if (c.demo) return MENSAJE_DEMO_SIN_COBRO;
  return bloqueoReserva(c, modoPrueba);
}
