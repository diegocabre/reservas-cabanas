import { Resend } from "resend";
import { ConfirmacionReserva, type DatosEmailConfirmacion } from "@/emails/confirmacion-reserva";
import { ReservaApartada } from "@/emails/reserva-apartada";
import { db } from "@/lib/db";
import { formatearCLP, formatearFechaLarga, formatearHora } from "@/lib/formato";
import { aFechaIso, nochesEntre } from "@/lib/precios";
import { MARCA_PRUEBA } from "@/lib/reservas";
import { urlDelSitio } from "@/lib/sitio";
import { enlaceWhatsapp, mensajeReserva } from "@/lib/whatsapp";

/** Remitente verificado en Resend (dominio reservas.solucionesdys.cl). */
const DIRECCION_REMITENTE = process.env.EMAIL_REMITENTE ?? "reservas@reservas.solucionesdys.cl";

/** Emails de ejemplo del seed: no se les envía nada (rebotarían y dañan la reputación del dominio). */
export function esEmailEnviable(email: string | null | undefined): email is string {
  return Boolean(email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !/@example\.(com|org|net)$/i.test(email));
}

/** Asunto del email al huésped. */
export function asuntoConfirmacion(d: { codigo: string; cabana: string; prueba: boolean }) {
  return `${d.prueba ? "[Prueba] " : ""}Reserva ${d.codigo} confirmada · ${d.cabana}`;
}

function clienteResend() {
  const clave = process.env.RESEND_API_KEY;
  return clave ? new Resend(clave) : null;
}

/**
 * Envía al huésped el link para pagar apenas crea la reserva, para que pueda volver si cierra
 * la página. Nunca lanza: si falla, la reserva sigue creada y el error queda en el log.
 */
export async function enviarEmailReservaApartada(codigo: string): Promise<void> {
  try {
    const resend = clienteResend();
    if (!resend) return;

    const r = await db.reserva.findUnique({
      where: { codigo },
      select: {
        codigo: true,
        checkIn: true,
        checkOut: true,
        total: true,
        abono: true,
        estado: true,
        expiraEn: true,
        notas: true,
        huespedNombre: true,
        huespedEmail: true,
        cabana: { select: { nombre: true, propiedad: { select: { nombre: true, email: true } } } },
      },
    });
    if (!r || r.estado !== "pendiente_pago" || !r.expiraEn || !esEmailEnviable(r.huespedEmail)) return;

    const checkIn = aFechaIso(r.checkIn);
    const checkOut = aFechaIso(r.checkOut);
    const prueba = r.notas?.startsWith(MARCA_PRUEBA) ?? false;
    const sitio = urlDelSitio();
    const { propiedad } = r.cabana;

    const { error } = await resend.emails.send({
      from: `${propiedad.nombre} <${DIRECCION_REMITENTE}>`,
      to: r.huespedEmail,
      replyTo: esEmailEnviable(propiedad.email) ? propiedad.email : undefined,
      subject: `${prueba ? "[Prueba] " : ""}Tus fechas están apartadas · Reserva ${r.codigo}`,
      react: ReservaApartada({
        codigo: r.codigo,
        nombreHuesped: r.huespedNombre.split(/\s+/)[0],
        propiedad: propiedad.nombre,
        cabana: r.cabana.nombre,
        llegada: formatearFechaLarga(checkIn),
        salida: formatearFechaLarga(checkOut),
        noches: nochesEntre(checkIn, checkOut).length,
        total: formatearCLP(r.total),
        abono: formatearCLP(r.abono),
        horaLimite: formatearHora(r.expiraEn),
        urlReserva: new URL(`/reserva/${r.codigo}`, sitio).toString(),
        urlBuscar: new URL("/mi-reserva", sitio).toString(),
        prueba,
      }),
    });
    if (error) console.error("No se pudo enviar el email de reserva apartada", r.codigo, error);
  } catch (e) {
    console.error("Error enviando el email de reserva apartada", codigo, e);
  }
}

/**
 * Envía la confirmación al huésped y el aviso al dueño cuando una reserva queda confirmada.
 * Nunca lanza: si el email falla, la reserva sigue confirmada y el error queda en el log.
 */
export async function enviarEmailsReservaConfirmada(codigo: string): Promise<void> {
  try {
    const resend = clienteResend();
    if (!resend) {
      console.warn("RESEND_API_KEY no configurada: no se envió la confirmación de", codigo);
      return;
    }

    const r = await db.reserva.findUnique({
      where: { codigo },
      select: {
        codigo: true,
        checkIn: true,
        checkOut: true,
        adultos: true,
        ninos: true,
        total: true,
        abono: true,
        notas: true,
        huespedNombre: true,
        huespedEmail: true,
        huespedTelefono: true,
        cabana: {
          select: {
            nombre: true,
            fotos: true,
            propiedad: {
              select: {
                nombre: true,
                ubicacion: true,
                urlMapa: true,
                email: true,
                whatsapp: true,
                instruccionesLlegada: true,
                politicaCancelacion: true,
              },
            },
          },
        },
      },
    });
    if (!r) return;

    const { cabana } = r;
    const { propiedad } = cabana;
    const checkIn = aFechaIso(r.checkIn);
    const checkOut = aFechaIso(r.checkOut);
    const nombre = r.huespedNombre.split(/\s+/)[0];
    const prueba = r.notas?.startsWith(MARCA_PRUEBA) ?? false;

    const datos: DatosEmailConfirmacion = {
      codigo: r.codigo,
      nombreHuesped: nombre,
      propiedad: propiedad.nombre,
      ubicacion: propiedad.ubicacion,
      cabana: cabana.nombre,
      foto: cabana.fotos[0] ?? null,
      llegada: formatearFechaLarga(checkIn),
      salida: formatearFechaLarga(checkOut),
      noches: nochesEntre(checkIn, checkOut).length,
      personas: r.adultos + r.ninos,
      total: formatearCLP(r.total),
      abono: formatearCLP(r.abono),
      saldo: formatearCLP(r.total - r.abono),
      instruccionesLlegada: propiedad.instruccionesLlegada,
      politicaCancelacion: propiedad.politicaCancelacion,
      urlReserva: new URL(`/reserva/${r.codigo}`, urlDelSitio()).toString(),
      urlWhatsapp: enlaceWhatsapp(
        propiedad.whatsapp,
        mensajeReserva({ codigo: r.codigo, cabana: cabana.nombre, checkIn, checkOut, nombre }),
      ),
      urlMapa: propiedad.urlMapa,
      prueba,
    };

    const remitente = `${propiedad.nombre} <${DIRECCION_REMITENTE}>`;
    const respuestaA = esEmailEnviable(propiedad.email) ? propiedad.email : undefined;

    if (esEmailEnviable(r.huespedEmail)) {
      const { error } = await resend.emails.send({
        from: remitente,
        to: r.huespedEmail,
        replyTo: respuestaA,
        subject: asuntoConfirmacion({ codigo: r.codigo, cabana: cabana.nombre, prueba }),
        react: ConfirmacionReserva(datos),
      });
      if (error) console.error("No se pudo enviar la confirmación al huésped", r.codigo, error);
    }

    // Aviso corto al dueño, con los datos de contacto del huésped.
    if (respuestaA) {
      const { error } = await resend.emails.send({
        from: remitente,
        to: respuestaA,
        replyTo: r.huespedEmail,
        subject: `${prueba ? "[Prueba] " : ""}Nueva reserva ${r.codigo} · ${cabana.nombre} · ${datos.llegada}`,
        text: [
          `Nueva reserva confirmada: ${r.codigo}`,
          `${cabana.nombre}, del ${datos.llegada} al ${datos.salida} (${datos.noches} noches, ${datos.personas} personas).`,
          `Huésped: ${r.huespedNombre} · ${r.huespedTelefono} · ${r.huespedEmail}`,
          `Total ${datos.total} · abono pagado ${datos.abono} · saldo por cobrar ${datos.saldo}.`,
          datos.urlReserva,
        ].join("\n"),
      });
      if (error) console.error("No se pudo avisar al dueño", r.codigo, error);
    }
  } catch (e) {
    console.error("Error enviando los emails de la reserva", codigo, e);
  }
}
