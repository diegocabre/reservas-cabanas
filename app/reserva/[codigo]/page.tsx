import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoPrueba } from "@/components/aviso-prueba";
import { IconoWhatsapp } from "@/components/iconos";
import { enlaceWhatsapp, mensajeReserva } from "@/lib/whatsapp";
import { PerfilVolcan } from "@/components/perfil-volcan";
import { enModoPrueba } from "@/lib/sitio";
import { formatearCLP, formatearFechaLarga, formatearHora } from "@/lib/formato";
import { nochesEntre } from "@/lib/precios";
import { pagoEnLineaDisponible, registrarPagoMercadoPago } from "@/lib/mercadopago";
import { obtenerReservaPublica } from "@/lib/reservas";
import { pagarAbono } from "./acciones";
import { BotonPagar } from "./boton-pagar";

export const metadata: Metadata = {
  title: "Tu reserva",
  robots: { index: false },
};

const ESTADOS = {
  pendiente_pago: { texto: "Pendiente de pago", clase: "bg-madera-clara/25 text-madera" },
  confirmada: { texto: "Confirmada", clase: "bg-musgo/15 text-musgo" },
  cancelada: { texto: "Cancelada", clase: "bg-tinta/10 text-tinta-suave" },
  completada: { texto: "Completada", clase: "bg-lago/10 text-lago" },
} as const;

export default async function PaginaReserva({ params, searchParams }: PageProps<"/reserva/[codigo]">) {
  const { codigo } = await params;
  const consulta = await searchParams;

  // Al volver de Mercado Pago llega el id del pago: se verifica contra su API antes de mostrar
  // nada (el webhook hace lo mismo; registrar dos veces no tiene efecto).
  const idPago = [consulta.payment_id, consulta.collection_id].flat().find((v) => v && /^\d+$/.test(v));
  if (idPago && pagoEnLineaDisponible()) {
    await registrarPagoMercadoPago(idPago).catch((e) => console.error("No se pudo verificar el pago", e));
  }

  const reserva = await obtenerReservaPublica(decodeURIComponent(codigo).toUpperCase());
  if (!reserva) notFound();
  const errorPago = consulta.error === "pago";
  const pagoRechazado = consulta.status === "rejected" || consulta.collection_status === "rejected";

  const { cabana } = reserva;
  const noches = nochesEntre(reserva.checkIn, reserva.checkOut).length;
  const estado = reserva.vencida ? { texto: "Vencida", clase: "bg-tinta/10 text-tinta-suave" } : ESTADOS[reserva.estado];
  const personas = reserva.adultos + reserva.ninos;

  const prueba = enModoPrueba() || reserva.prueba;
  const nombre = reserva.huesped.split(" ")[0];
  const whatsapp = enlaceWhatsapp(
    cabana.propiedad.whatsapp,
    mensajeReserva({ codigo: reserva.codigo, cabana: cabana.nombre, checkIn: reserva.checkIn, checkOut: reserva.checkOut, nombre }),
  );

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-8 pb-16">
      {prueba && <AvisoPrueba className="mb-6" />}
      <div className="text-center">
        <PerfilVolcan className="mx-auto h-10 w-48" />
        <p className="mt-4 text-xs font-bold tracking-[0.18em] text-madera uppercase">Reserva {reserva.codigo}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-balance">
          {reserva.estado === "confirmada"
            ? `¡Reserva confirmada, ${nombre}!`
            : reserva.estado === "pendiente_pago" && !reserva.vencida
              ? `¡Listo, ${nombre}! Tus fechas están apartadas`
              : `Reserva de ${reserva.huesped}`}
        </h1>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${estado.clase}`}>{estado.texto}</span>
      </div>

      {reserva.estado === "pendiente_pago" && !reserva.vencida && reserva.expiraEn && (
        <div className="mt-6 rounded-3xl border border-madera/25 bg-madera-clara/15 p-5 text-center">
          {reserva.pagoEnProceso ? (
            <>
              <p className="font-semibold">Tu pago está en proceso.</p>
              <p className="mt-1 text-sm text-tinta-suave">
                Mercado Pago lo está revisando. Apenas se apruebe, tu reserva quedará confirmada en esta página.
              </p>
            </>
          ) : pagoEnLineaDisponible() ? (
            <>
              <p className="font-semibold">
                Paga el abono de <strong>{formatearCLP(reserva.abono)}</strong> antes de las{" "}
                <strong>{formatearHora(reserva.expiraEn)}</strong> para confirmar.
              </p>
              <p className="mt-1 text-sm text-tinta-suave">Después de esa hora las fechas se liberan para otros huéspedes.</p>
              {(errorPago || pagoRechazado) && (
                <p role="alert" className="mt-4 rounded-2xl bg-fuego/10 px-4 py-3 text-sm font-semibold text-fuego-hondo">
                  {pagoRechazado
                    ? "El pago fue rechazado. Puedes intentarlo de nuevo con otro medio de pago."
                    : "No pudimos abrir el pago. Intenta de nuevo en unos segundos."}
                </p>
              )}
              <form action={pagarAbono} className="mt-4">
                <input type="hidden" name="codigo" value={reserva.codigo} />
                <BotonPagar abono={formatearCLP(reserva.abono)} prueba={prueba} />
              </form>
              <p className="mt-3 text-xs text-tinta-suave">
                {prueba
                  ? "Pago de prueba en Mercado Pago: usa una tarjeta de prueba. No se cobra dinero real."
                  : "Pagas en Mercado Pago con tarjeta de crédito o débito."}
              </p>
            </>
          ) : prueba ? (
            <>
              <p className="font-semibold">Como es una reserva de prueba, no tienes que pagar nada.</p>
              <p className="mt-1 text-sm text-tinta-suave">
                En una reserva real tendrías hasta las <strong>{formatearHora(reserva.expiraEn)}</strong> para pagar el
                abono de <strong>{formatearCLP(reserva.abono)}</strong>. Después de esa hora las fechas se liberan.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">
                Paga el abono de <strong>{formatearCLP(reserva.abono)}</strong> antes de las{" "}
                <strong>{formatearHora(reserva.expiraEn)}</strong> para confirmar.
              </p>
              <p className="mt-1 text-sm text-tinta-suave">Después de esa hora las fechas se liberan para otros huéspedes.</p>
            </>
          )}
        </div>
      )}

      {reserva.estado === "confirmada" && (
        <div className="mt-6 rounded-3xl border border-musgo/30 bg-musgo/10 p-5 text-center">
          <p className="font-semibold text-musgo">Recibimos el abono de {formatearCLP(reserva.abono)}.</p>
          <p className="mt-1 text-sm text-tinta-suave">
            Tus fechas están reservadas. El saldo de {formatearCLP(reserva.total - reserva.abono)} se paga directo a la
            cabaña.
          </p>
        </div>
      )}

      {reserva.vencida && (
        <div className="mt-6 rounded-3xl border border-linea bg-nieve p-5 text-center">
          <p className="font-semibold">El plazo para pagar el abono terminó y las fechas se liberaron.</p>
          <Link
            href={`/reservar/${cabana.propiedad.slug}/${cabana.slug}`}
            className="mt-4 inline-block rounded-full bg-fuego px-6 py-3 font-bold text-nieve"
          >
            Volver a reservar
          </Link>
        </div>
      )}

      <section className="vetas mt-6 overflow-hidden rounded-3xl border border-linea bg-nieve">
        {cabana.fotos[0] && (
          <div className="relative aspect-[2/1]">
            <Image src={cabana.fotos[0]} alt={cabana.nombre} fill sizes="(min-width: 640px) 576px, 100vw" className="object-cover" />
          </div>
        )}
        <div className="p-5">
          <p className="text-xs font-bold tracking-[0.18em] text-madera uppercase">{cabana.propiedad.nombre}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{cabana.nombre}</h2>
          {cabana.propiedad.ubicacion && <p className="text-sm text-tinta-suave">{cabana.propiedad.ubicacion}</p>}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-papel-hondo px-3 py-2">
              <dt className="text-xs text-tinta-suave">Llegada</dt>
              <dd className="font-semibold">{formatearFechaLarga(reserva.checkIn)}</dd>
            </div>
            <div className="rounded-2xl bg-papel-hondo px-3 py-2">
              <dt className="text-xs text-tinta-suave">Salida</dt>
              <dd className="font-semibold">{formatearFechaLarga(reserva.checkOut)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-tinta-suave">
            {noches} {noches === 1 ? "noche" : "noches"} · {personas} {personas === 1 ? "persona" : "personas"}
          </p>

          <div className="mt-4 space-y-1.5 border-t border-linea pt-4">
            <p className="flex justify-between font-display text-xl font-semibold">
              <span>Total</span>
              <span>{formatearCLP(reserva.total)}</span>
            </p>
            <p className="flex justify-between text-sm font-semibold text-lago">
              <span>Abono</span>
              <span>{formatearCLP(reserva.abono)}</span>
            </p>
            <p className="flex justify-between text-sm text-tinta-suave">
              <span>Saldo pendiente</span>
              <span>{formatearCLP(reserva.total - reserva.abono)}</span>
            </p>
          </div>
        </div>
      </section>

      {whatsapp && reserva.estado !== "cancelada" && !reserva.vencida && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-center gap-2 rounded-full bg-musgo px-6 py-3.5 font-bold text-nieve transition-opacity hover:opacity-90"
        >
          <IconoWhatsapp className="size-5" />
          Escribir por WhatsApp
        </a>
      )}

      <section className="mt-6 px-1 text-sm text-tinta-suave">
        <h2 className="font-semibold text-tinta">Instrucciones de llegada</h2>
        {reserva.estado === "confirmada" && cabana.propiedad.instruccionesLlegada ? (
          <p className="mt-1 whitespace-pre-line">{cabana.propiedad.instruccionesLlegada}</p>
        ) : (
          <p className="mt-1">Las verás aquí cuando se confirme el pago del abono.</p>
        )}
        {cabana.propiedad.urlMapa && (
          <a
            href={cabana.propiedad.urlMapa}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-semibold text-lago underline decoration-lago/30 underline-offset-4"
          >
            Ver la ubicación en el mapa
          </a>
        )}
      </section>

      {cabana.propiedad.politicaCancelacion && (
        <section className="mt-6 px-1 text-sm text-tinta-suave">
          <h2 className="font-semibold text-tinta">Política de cancelación</h2>
          <p className="mt-1">{cabana.propiedad.politicaCancelacion}</p>
        </section>
      )}

      <p className="mt-6 px-1 text-sm text-tinta-suave">
        Guarda el código <strong className="text-tinta">{reserva.codigo}</strong> para cualquier consulta con la cabaña.
      </p>
    </main>
  );
}
