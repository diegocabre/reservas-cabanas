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
