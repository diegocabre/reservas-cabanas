"use client";

import { format, parseISO } from "date-fns";
import { useMemo, useSyncExternalStore } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { limiteSalida } from "@/lib/disponibilidad";

// El calendario trabaja con fechas locales del navegador; hacia afuera todo es "YYYY-MM-DD".
const aIso = (dia: Date) => format(dia, "yyyy-MM-dd");

export type Fechas = { checkIn?: string; checkOut?: string };

type Props = Fechas & {
  ocupadas: string[];
  hoy: string;
  ultimoDia: string;
  onCambio: (fechas: Fechas) => void;
};

/** Un mes en el celular, dos en escritorio. */
function useEsEscritorio() {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia("(min-width: 768px)");
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

/**
 * Calendario de llegada y salida.
 * - Primer toque: llegada (solo noches libres). Segundo toque: salida.
 * - La salida puede caer el día en que llega otro huésped, pero no después.
 */
export function Calendario({ checkIn, checkOut, ocupadas, hoy, ultimoDia, onCambio }: Props) {
  const escritorio = useEsEscritorio();
  const ocupadasSet = useMemo(() => new Set(ocupadas), [ocupadas]);
  const eligiendoSalida = Boolean(checkIn && !checkOut);
  const limite = useMemo(
    () => (checkIn && !checkOut ? limiteSalida(checkIn, ocupadasSet) : null),
    [checkIn, checkOut, ocupadasSet],
  );

  function deshabilitado(dia: Date): boolean {
    const iso = aIso(dia);
    if (iso < hoy || iso > ultimoDia) return true;
    if (eligiendoSalida && checkIn && iso > checkIn) return limite !== null && iso > limite;
    // Como llegada: la noche tiene que estar libre y quedar al menos una noche antes del último día.
    return ocupadasSet.has(iso) || iso >= ultimoDia;
  }

  function elegir(dia: Date) {
    const iso = aIso(dia);
    if (!checkIn || checkOut || iso <= checkIn) onCambio({ checkIn: iso });
    else onCambio({ checkIn, checkOut: iso });
  }

  return (
    <DayPicker
      mode="range"
      locale={es}
      className="calendario-reserva"
      numberOfMonths={escritorio ? 2 : 1}
      startMonth={parseISO(hoy)}
      endMonth={parseISO(ultimoDia)}
      defaultMonth={parseISO(checkIn ?? hoy)}
      selected={{ from: checkIn ? parseISO(checkIn) : undefined, to: checkOut ? parseISO(checkOut) : undefined }}
      onSelect={(_rango, dia) => elegir(dia)}
      disabled={deshabilitado}
      modifiers={{ ocupada: (dia) => ocupadasSet.has(aIso(dia)) }}
      modifiersClassNames={{ ocupada: "dia-ocupado" }}
    />
  );
}
