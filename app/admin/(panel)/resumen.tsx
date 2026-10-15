// Piezas del resumen del día. Server Components: no necesitan JavaScript en el navegador.

import Link from "next/link";
import type { ReactNode } from "react";
import { IconoWhatsapp } from "@/components/iconos";
import { tienePlazo } from "@/lib/estados-reserva";
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
 * Próximos días como una tira de celdas, una por noche: reservada (todas las cabañas), algunas
 * cabañas reservadas, bloqueada por el dueño, o libre. Debajo, el total del periodo.
 */
export function TiraOcupacion({
  dias,
  cabanas,
  resumen,
}: {
  dias: { fecha: string; ocupadas: number; bloqueadas: number }[];
  cabanas: number;
  resumen: { nochesOcupadas: number; nochesBloqueadas: number; nochesDisponibles: number; porcentaje: number };
}) {
  const hayBloqueos = dias.some((d) => d.bloqueadas > 0);

  return (
    <div className="rounded-2xl border border-linea bg-nieve p-4">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-4xl font-semibold tabular-nums">{resumen.porcentaje}%</span>
        <span className="text-sm text-tinta-suave">
          {resumen.nochesOcupadas} de {resumen.nochesDisponibles} noches reservadas
          {resumen.nochesBloqueadas > 0 && `, ${resumen.nochesBloqueadas} bloqueadas`}
        </span>
      </p>
      <ol className="mt-4 grid grid-cols-10 gap-1" aria-label="Ocupación por noche">
        {dias.map((d) => {
          const nivel = nivelNoche(d, cabanas);
          const texto = textoNoche(d, cabanas, nivel);
          return (
            <li key={d.fecha} title={`${formatearFechaCorta(d.fecha)}: ${texto}`} className={`h-7 rounded-md ${ESTILO_NOCHE[nivel]}`}>
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
          <span className={`size-3 rounded-sm ${ESTILO_NOCHE.lleno}`} aria-hidden="true" /> Reservada
        </span>
        {cabanas > 1 && (
          <span className="flex items-center gap-1.5">
            <span className={`size-3 rounded-sm ${ESTILO_NOCHE.parcial}`} aria-hidden="true" /> Algunas cabañas
          </span>
        )}
        {hayBloqueos && (
          <span className="flex items-center gap-1.5">
            <span className={`size-3 rounded-sm ${ESTILO_NOCHE.bloqueado}`} aria-hidden="true" /> Bloqueada
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className={`size-3 rounded-sm ${ESTILO_NOCHE.libre}`} aria-hidden="true" /> Libre
        </span>
      </p>
    </div>
  );
}

type NivelNoche = "libre" | "parcial" | "lleno" | "bloqueado";

/** Las noches bloqueadas llevan rayas: se distinguen de las reservadas también sin depender del color. */
const ESTILO_NOCHE: Record<NivelNoche, string> = {
  libre: "bg-papel-hondo",
  parcial: "bg-lago/45",
  lleno: "bg-lago",
  bloqueado: "rayas-bloqueo",
};

function nivelNoche(d: { ocupadas: number; bloqueadas: number }, cabanas: number): NivelNoche {
  if (cabanas === 0 || d.ocupadas + d.bloqueadas === 0) return "libre";
  if (d.ocupadas === 0) return "bloqueado";
  return d.ocupadas + d.bloqueadas >= cabanas ? "lleno" : "parcial";
}

function textoNoche(d: { ocupadas: number; bloqueadas: number }, cabanas: number, nivel: NivelNoche): string {
  if (nivel === "libre") return "libre";
  if (nivel === "bloqueado") {
    return cabanas === 1 || d.bloqueadas >= cabanas ? "bloqueada" : `${d.bloqueadas} de ${cabanas} cabañas bloqueadas`;
  }
  if (cabanas === 1) return "reservada";
  return `${d.ocupadas} de ${cabanas} cabañas reservadas${d.bloqueadas ? `, ${d.bloqueadas} bloqueadas` : ""}`;
}

const ESTILO_ESTADO = {
  pendiente_pago: "bg-madera-clara/25 text-madera",
  confirmada: "bg-musgo/15 text-musgo",
  cancelada: "bg-tinta/8 text-tinta-suave",
  completada: "bg-lago/10 text-lago",
  pendiente_aprobacion: "bg-lago/10 text-lago",
  aprobada_pendiente_pago: "bg-madera-clara/25 text-madera",
  rechazada: "bg-tinta/8 text-tinta-suave",
  expirada: "bg-tinta/8 text-tinta-suave",
  vencida: "bg-tinta/8 text-tinta-suave",
  revisar: "bg-fuego/15 text-fuego-hondo",
} as const;

const TEXTO_ESTADO = {
  pendiente_pago: "Pendiente de pago",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  pendiente_aprobacion: "Solicitud pendiente",
  aprobada_pendiente_pago: "Esperando pago",
  rechazada: "Rechazada",
  expirada: "Expirada",
  vencida: "Vencida sin pagar",
  revisar: "Revisar pago",
} as const;

/** Etiqueta de estado de una reserva. Una con plazo vencido (aún sin marcar por el cron) se muestra como vencida. */
export function EtiquetaEstado({ estado, vencida = false }: { estado: ReservaPanel["estado"] | "revisar"; vencida?: boolean }) {
  const clave = vencida && estado !== "revisar" && tienePlazo(estado) ? (estado === "pendiente_pago" ? "vencida" : "expirada") : estado;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${ESTILO_ESTADO[clave]}`}>
      {TEXTO_ESTADO[clave]}
    </span>
  );
}
