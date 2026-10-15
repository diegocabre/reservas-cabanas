import { formatearFechaLarga } from "@/lib/formato";

/** Link wa.me con texto prellenado, o null si el número no sirve. */
export function enlaceWhatsapp(numero: string, mensaje: string): string | null {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
}

/** Mensaje del huésped a la cabaña sobre su reserva. */
export function mensajeReserva(r: { codigo: string; cabana: string; checkIn: string; checkOut: string; nombre: string }) {
  return (
    `Hola, soy ${r.nombre}. Hice la reserva ${r.codigo} en ${r.cabana}, ` +
    `del ${formatearFechaLarga(r.checkIn)} al ${formatearFechaLarga(r.checkOut)}.`
  );
}

/** Mensaje del huésped que quiere reservar por WhatsApp (cabañas sin pago en línea). */
export function mensajeConsultaReserva(cabana: string) {
  return `Hola, quiero reservar ${cabana}. ¿Qué fechas tienen disponibles?`;
}

/** Mensaje del dueño al huésped (desde el panel) sobre su llegada. */
export function mensajeAlHuesped(r: { nombre: string; propiedad: string; codigo: string; checkIn: string }) {
  const [primerNombre] = r.nombre.trim().split(/\s+/);
  return `Hola ${primerNombre}, te escribo de ${r.propiedad} por tu reserva ${r.codigo} con llegada el ${formatearFechaLarga(r.checkIn)}.`;
}

/** Mensaje del dueño al huésped cuando aprueba su solicitud: lleva el MISMO link de pago del correo. */
export function mensajeAprobacion(r: {
  nombre: string;
  cabana: string;
  checkIn: string;
  checkOut: string;
  linkPago: string;
  limite: string; // "16 de octubre de 2026 a las 15:30"
}) {
  const [primerNombre] = r.nombre.trim().split(/\s+/);
  return (
    `Hola ${primerNombre}, te escribo de ${r.cabana}. ¡Aprobé tu solicitud de reserva del ` +
    `${formatearFechaLarga(r.checkIn)} al ${formatearFechaLarga(r.checkOut)}! Para confirmarla, paga aquí: ` +
    `${r.linkPago}. El link vence el ${r.limite}. ¡Te esperamos!`
  );
}
