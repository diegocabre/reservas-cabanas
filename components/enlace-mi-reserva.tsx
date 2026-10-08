import Link from "next/link";

/** "¿Ya reservaste?": lleva a buscar la reserva con código y email. */
export function EnlaceMiReserva({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-tinta-suave ${className}`}>
      ¿Ya reservaste?{" "}
      <Link href="/mi-reserva" className="font-semibold text-lago underline decoration-lago/30 underline-offset-4 hover:decoration-lago">
        Busca tu reserva
      </Link>{" "}
      con tu código y tu email.
    </p>
  );
}
