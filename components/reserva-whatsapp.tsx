import { IconoWhatsapp } from "@/components/iconos";

/**
 * Botón para reservar conversando por WhatsApp: lo ven las cabañas que todavía no reciben pagos en
 * línea (el dueño no conectó su Mercado Pago). Abre el chat con un mensaje listo.
 */
export function BotonReservaWhatsapp({
  href,
  corto = false,
  className = "",
}: {
  href: string;
  /** Etiqueta corta ("Reservar") para la barra fija del celular; el ícono ya dice WhatsApp. */
  corto?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Reservar por WhatsApp"
      className={`flex min-h-12 items-center justify-center gap-2 rounded-full bg-musgo px-6 py-3 font-bold text-nieve shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] ${className}`}
    >
      <IconoWhatsapp className="size-5" />
      {corto ? "Reservar" : "Reservar por WhatsApp"}
    </a>
  );
}

/** Bloque completo para la página de reservar: explica y ofrece el WhatsApp. */
export function ReservaPorWhatsapp({ href, className = "" }: { href: string; className?: string }) {
  return (
    <div className={`rounded-3xl border border-linea bg-nieve px-5 py-6 text-center ${className}`}>
      <p className="font-display text-xl font-semibold text-tinta">Reserva por WhatsApp</p>
      <p className="mt-2 text-sm text-tinta-suave">
        Por ahora esta cabaña coordina las reservas directamente por WhatsApp. Escríbenos y te contamos qué fechas hay
        disponibles.
      </p>
      <BotonReservaWhatsapp href={href} className="mx-auto mt-5 max-w-xs" />
    </div>
  );
}
