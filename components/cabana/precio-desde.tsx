import Link from "next/link";
import { IconoFlecha } from "@/components/iconos";
import { formatearCLP } from "@/lib/formato";

export function PrecioDesde({ precio }: { precio: number | null }) {
  if (precio === null) {
    return <p className="text-sm leading-tight text-tinta-suave">Consulta fechas y precios</p>;
  }
  return (
    <p className="leading-tight">
      <span className="block text-xs font-semibold tracking-wide text-tinta-suave uppercase">Desde</span>
      <span className="font-display text-2xl font-semibold text-tinta">{formatearCLP(precio)}</span>
      <span className="text-sm text-tinta-suave"> por noche</span>
    </p>
  );
}

export function BotonDisponibilidad({ href, className = "" }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-fuego px-6 py-3.5 font-bold text-nieve shadow-[0_6px_20px_-6px_var(--fuego)] transition-colors hover:bg-fuego-hondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuego active:scale-[0.98] ${className}`}
    >
      Ver disponibilidad
      <IconoFlecha className="size-4" />
    </Link>
  );
}
