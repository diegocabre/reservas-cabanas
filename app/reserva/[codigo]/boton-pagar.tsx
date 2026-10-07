"use client";

import { useFormStatus } from "react-dom";

export function BotonPagar({ abono, prueba }: { abono: string; prueba: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-fuego px-6 py-4 text-lg font-bold text-nieve shadow-[0_6px_20px_-6px_var(--fuego)] transition-colors hover:bg-fuego-hondo disabled:opacity-70"
    >
      {pending ? "Abriendo Mercado Pago…" : `Pagar abono de ${abono}${prueba ? " (prueba)" : ""}`}
    </button>
  );
}
