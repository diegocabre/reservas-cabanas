// Piezas del resumen del día. Server Components: no necesitan JavaScript en el navegador.

import Link from "next/link";
import type { ReactNode } from "react";
import { IconoWhatsapp } from "@/components/iconos";
import { formatearCLP, formatearFechaCorta } from "@/lib/formato";
import type { ReservaPanel } from "@/lib/panel";
import { enlaceWhatsapp, mensajeAlHuesped } from "@/lib/whatsapp";

const saldoDe = (r: ReservaPanel) => Math.max(0, r.total - r.pagado);
const personasTexto = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;

export function Seccion({ titulo, cantidad, children }: { titulo: string; cantidad?: number; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline gap-2 font-display text-xl font-semibold">
        {titulo}
        {cantidad !== undefined && <span className="font-sans text-base font-bold text-tinta-suave tabular-nums">{cantidad}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-linea px-4 py-4 text-sm text-tinta-suave">{children}</p>;
}

/** Saldo de una reserva: lo que falta cobrar, o "Pagado". */
function Saldo({ reserva }: { reserva: ReservaPanel }) {
  const saldo = saldoDe(reserva);
  if (saldo === 0) return <span className="text-sm font-semibold text-musgo">Pagado</span>;
  return (
    <span className="text-right">
      <span className="block text-xs text-tinta-suave">Por cobrar</span>
      <span className="block font-bold text-fuego-hondo tabular-nums">{formatearCLP(saldo)}</span>
    </span>
  );
}

/** Llegada de hoy: lo que el dueño necesita para recibir al huésped, y un botón para escribirle. */
export function TarjetaLlegada({
  reserva,
  propiedad,
  mostrarCabana,
}: {
  reserva: ReservaPanel;
  propiedad: string;
  mostrarCabana: boolean;
}) {
  const whatsapp = reserva.telefono
    ? enlaceWhatsapp(
        reserva.telefono,
        mensajeAlHuesped({ nombre: reserva.huesped, propiedad, codigo: reserva.codigo, checkIn: String(reserva.checkIn) }),
      )
    : null;

  return (
    <li className="rounded-2xl border border-linea bg-nieve p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/admin/reservas/${reserva.codigo}`} className="block truncate text-lg font-bold underline-offset-4 hover:underline">
            {reserva.huesped}
          </Link>
          <p className="mt-0.5 text-sm text-tinta-suave">
            {mostrarCabana && `${reserva.cabana}, `}
            {personasTexto(reserva.personas)}
          </p>
          <p className="text-sm text-tinta-suave">Sale el {formatearFechaCorta(String(reserva.checkOut))}</p>
        </div>
        <Saldo reserva={reserva} />
      </div>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Escribir a ${reserva.huesped} por WhatsApp`}
          className="mt-4 flex items-center justify-center gap-2 rounded-full bg-musgo px-5 py-3 font-bold text-nieve transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
        >
          <IconoWhatsapp className="size-5" />
          WhatsApp
        </a>
      )}
    </li>
  );
}

/** Fila compacta: huésped, cabaña y un dato a la derecha (saldo, fecha de salida). */
export function FilaReserva({ reserva, detalle, derecha }: { reserva: ReservaPanel; detalle: string; derecha?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <Link href={`/admin/reservas/${reserva.codigo}`} className="block truncate font-semibold underline-offset-4 hover:underline">
          {reserva.huesped}
        </Link>
        <p className="truncate text-sm text-tinta-suave">{detalle}</p>
      </div>
      {derecha ?? <Saldo reserva={reserva} />}
    </li>
  );
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-nieve">{children}</ul>;
}

/**
 * Próximos días como una tira de celdas: llena = todas las cabañas ocupadas, a medias = algunas,
 * vacía = libre. Debajo, el total del periodo.
 */
export function TiraOcupacion({
  dias,
  cabanas,
  resumen,
}: {
  dias: { fecha: string; ocupadas: number }[];
  cabanas: number;
  resumen: { nochesOcupadas: number; nochesDisponibles: number; porcentaje: number };
}) {
  return (
    <div className="rounded-2xl border border-linea bg-nieve p-4">
      <p className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold tabular-nums">{resumen.porcentaje}%</span>
        <span className="text-sm text-tinta-suave">
          {resumen.nochesOcupadas} de {resumen.nochesDisponibles} noches ocupadas
        </span>
      </p>
      <ol className="mt-4 grid grid-cols-10 gap-1" aria-label="Ocupación por noche">
        {dias.map((d) => {
          const nivel = cabanas === 0 || d.ocupadas === 0 ? "libre" : d.ocupadas >= cabanas ? "lleno" : "parcial";
          const color = { libre: "bg-papel-hondo", parcial: "bg-lago/45", lleno: "bg-lago" }[nivel];
          const texto =
            nivel === "libre" ? "libre" : cabanas === 1 ? "ocupada" : `${d.ocupadas} de ${cabanas} cabañas ocupadas`;
          return (
            <li key={d.fecha} title={`${formatearFechaCorta(d.fecha)}: ${texto}`} className={`h-7 rounded-md ${color}`}>
              <span className="sr-only">
                {formatearFechaCorta(d.fecha)}: {texto}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex justify-between text-xs text-tinta-suave">
        <span>Hoy</span>
        <span>{formatearFechaCorta(dias[dias.length - 1].fecha)}</span>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-suave">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-lago" aria-hidden="true" /> Ocupada
        </span>
        {cabanas > 1 && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-lago/45" aria-hidden="true" /> Algunas cabañas
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-papel-hondo" aria-hidden="true" /> Libre
        </span>
      </p>
    </div>
  );
}

const ESTILO_ESTADO = {
  pendiente_pago: "bg-madera-clara/25 text-madera",
  confirmada: "bg-musgo/15 text-musgo",
  cancelada: "bg-tinta/8 text-tinta-suave",
  completada: "bg-lago/10 text-lago",
  vencida: "bg-tinta/8 text-tinta-suave",
  revisar: "bg-fuego/15 text-fuego-hondo",
} as const;

const TEXTO_ESTADO = {
  pendiente_pago: "Pendiente de pago",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  vencida: "Vencida sin pagar",
  revisar: "Revisar pago",
} as const;

/** Etiqueta de estado de una reserva. Una pendiente cuyo plazo venció se muestra como vencida. */
export function EtiquetaEstado({ estado, vencida = false }: { estado: ReservaPanel["estado"] | "revisar"; vencida?: boolean }) {
  const clave = vencida && estado === "pendiente_pago" ? "vencida" : estado;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${ESTILO_ESTADO[clave]}`}>
      {TEXTO_ESTADO[clave]}
    </span>
  );
}
