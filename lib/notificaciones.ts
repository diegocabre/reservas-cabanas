// Avisos de las solicitudes de reserva, separados del canal. Hoy el único canal es el correo
// (Resend, el mismo de lib/emails.ts); para sumar WhatsApp automático (API de Meta) basta con agregar
// "whatsapp" a CanalAviso y su envío en notificarHuesped, sin tocar a quienes la llaman.
// Sin base de datos: lib/aprobacion.ts arma los datos y registra las fallas en la reserva.

import { Resend } from "resend";
import { AvisoSolicitud } from "@/emails/aviso-solicitud";
import { esEmailEnviable } from "@/lib/emails";

export type CanalAviso = "email";

export type PlantillaHuesped =
  | "solicitud_recibida"
  | "solicitud_aprobada"
  | "recordatorio_pago"
  | "solicitud_rechazada"
  | "solicitud_expirada" // el dueño no respondió a tiempo
  | "pago_expirado"
  | "invitacion_resena" // reseñas (lib/resenas.ts): llevan datos.urlResena
  | "recordatorio_resena";

export type PlantillaDueno = "nueva_solicitud" | "recordatorio_solicitud" | "pago_expirado" | "resena_huesped_pendiente";

export interface DatosAviso {
  codigo: string;
  prueba: boolean;
  propiedad: string;
  emailPropiedad: string;
  cabana: string;
  huespedNombre: string;
  huespedEmail: string;
  huespedTelefono: string;
  mensaje: string | null; // presentación del huésped para el dueño
  llegada: string; // "20 de octubre de 2026"
  salida: string;
  noches: number;
  personas: number;
  total: string;
  abono: string;
  limite: string | null; // "16 de octubre de 2026 a las 15:30": plazo del dueño o vencimiento del link
  linkPago: string | null;
  motivo: string | null; // motivo de rechazo
  urlReserva: string; // página pública /reserva/[codigo]
  urlReservar: string; // volver a reservar la cabaña
  urlPanel: string; // detalle en /admin
  urlResena?: string | null; // link único para dejar la reseña (invitación y recordatorio)
}

export type ResultadoAviso = { ok: true } | { ok: false; error: string };

/** Nombre de cada aviso para mostrar en el panel cuando falla. */
export const NOMBRE_AVISO: Record<PlantillaHuesped | `dueno_${PlantillaDueno}`, string> = {
  solicitud_recibida: "Correo «recibimos tu solicitud» al huésped",
  solicitud_aprobada: "Correo de aprobación con el link de pago al huésped",
  recordatorio_pago: "Recordatorio de pago al huésped",
  solicitud_rechazada: "Correo de rechazo al huésped",
  solicitud_expirada: "Aviso de solicitud expirada al huésped",
  pago_expirado: "Aviso de link vencido al huésped",
  invitacion_resena: "Invitación a dejar una reseña",
  recordatorio_resena: "Recordatorio de reseña al huésped",
  dueno_nueva_solicitud: "Aviso de nueva solicitud al dueño",
  dueno_recordatorio_solicitud: "Recordatorio de solicitud al dueño",
  dueno_pago_expirado: "Aviso de link vencido al dueño",
  dueno_resena_huesped_pendiente: "Recordatorio de reseña del huésped al dueño",
};

/** Correos de reseñas: no muestran precios ni "Solicitud" en el encabezado. */
const PLANTILLAS_RESENA: PlantillaHuesped[] = ["invitacion_resena", "recordatorio_resena"];

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0];

/** Texto del correo al huésped de cada plantilla. */
export function contenidoHuesped(plantilla: PlantillaHuesped, d: DatosAviso) {
  const nombre = primerNombre(d.huespedNombre);
  const prefijo = d.prueba ? "[Prueba] " : "";
  const pagar = d.linkPago ? { texto: `Pagar y confirmar mi reserva`, url: d.linkPago } : null;
  switch (plantilla) {
    case "solicitud_recibida":
      return {
        asunto: `${prefijo}Recibimos tu solicitud · ${d.cabana}`,
        titulo: `${nombre}, recibimos tu solicitud`,
        parrafos: [
          `El anfitrión de ${d.cabana} revisará tu solicitud${d.limite ? ` y te responderá a más tardar el ${d.limite}` : ""}.`,
          "Mientras tanto tus fechas quedan reservadas para ti. No se te cobra nada hasta que la solicitud sea aprobada.",
        ],
        boton: { texto: "Ver mi solicitud", url: d.urlReserva },
      };
    case "solicitud_aprobada":
      return {
        asunto: `${prefijo}¡Tu solicitud fue aprobada! Paga para confirmar · ${d.cabana}`,
        titulo: `¡Hola ${nombre}! El anfitrión aprobó tu solicitud`,
        parrafos: [
          `Para confirmar tu reserva paga el abono de ${d.abono}${d.limite ? ` antes del ${d.limite}` : ""}.`,
          "Si no pagas a tiempo, las fechas se liberan para otros huéspedes.",
        ],
        boton: pagar,
      };
    case "recordatorio_pago":
      return {
        asunto: `${prefijo}Tu link de pago vence pronto · ${d.cabana}`,
        titulo: `${nombre}, tu reserva aún no está confirmada`,
        parrafos: [
          `Te quedan pocas horas para pagar el abono de ${d.abono}${d.limite ? `: el link vence el ${d.limite}` : ""}.`,
          "Después de esa hora las fechas se liberan.",
        ],
        boton: pagar,
      };
    case "solicitud_rechazada":
      return {
        asunto: `${prefijo}Sobre tu solicitud en ${d.cabana}`,
        titulo: `${nombre}, esta vez no fue posible`,
        parrafos: [
          `El anfitrión de ${d.cabana} no pudo aceptar tu solicitud del ${d.llegada} al ${d.salida}. No se te cobró nada.`,
          ...(d.motivo ? [`Su mensaje: «${d.motivo}»`] : []),
          "Gracias por tu interés. Puedes revisar otras fechas cuando quieras.",
        ],
        boton: { texto: "Ver otras fechas", url: d.urlReservar },
      };
    case "solicitud_expirada":
      return {
        asunto: `${prefijo}Tu solicitud en ${d.cabana} expiró`,
        titulo: `${nombre}, tu solicitud expiró`,
        parrafos: [
          "El anfitrión no alcanzó a responder a tiempo, así que liberamos las fechas. No se te cobró nada.",
          "Si todavía quieres viajar, puedes enviar una nueva solicitud.",
        ],
        boton: { texto: "Enviar otra solicitud", url: d.urlReservar },
      };
    case "pago_expirado":
      return {
        asunto: `${prefijo}Tu link de pago venció · ${d.cabana}`,
        titulo: `${nombre}, el plazo para pagar terminó`,
        parrafos: [
          "Como no recibimos el pago a tiempo, las fechas se liberaron. No se te cobró nada.",
          "Si todavía quieres venir, puedes enviar una nueva solicitud o escribirle al anfitrión respondiendo este correo.",
        ],
        boton: { texto: "Enviar otra solicitud", url: d.urlReservar },
      };
    case "invitacion_resena":
      return {
        asunto: `${prefijo}¿Cómo te fue en ${d.cabana}?`,
        titulo: `${nombre}, ¡gracias por quedarte en ${d.cabana}!`,
        parrafos: [
          "¿Nos cuentas cómo te fue? Son cinco estrellas y un comentario; no necesitas crear una cuenta.",
          "Tu reseña se publica cuando el anfitrión escriba la suya o a los 14 días, lo que pase primero. El link es personal y vence en 30 días.",
        ],
        boton: d.urlResena ? { texto: "Dejar mi reseña", url: d.urlResena } : null,
      };
    case "recordatorio_resena":
      return {
        asunto: `${prefijo}Todavía puedes dejar tu reseña · ${d.cabana}`,
        titulo: `${nombre}, ¿nos dejas tu reseña?`,
        parrafos: [
          `Tu opinión sobre ${d.cabana} ayuda a otros viajeros y al anfitrión. Te toma un par de minutos.`,
          "El link es personal y vence a los 30 días de tu salida.",
        ],
        boton: d.urlResena ? { texto: "Dejar mi reseña", url: d.urlResena } : null,
      };
  }
}

/** Texto plano del aviso al dueño (igual que el aviso de reserva confirmada de lib/emails.ts). */
export function contenidoDueno(plantilla: PlantillaDueno, d: DatosAviso) {
  const prefijo = d.prueba ? "[Prueba] " : "";
  const estadia = `${d.cabana}, del ${d.llegada} al ${d.salida} (${d.noches} ${d.noches === 1 ? "noche" : "noches"}, ${d.personas} ${d.personas === 1 ? "persona" : "personas"}).`;
  const huesped = `Huésped: ${d.huespedNombre} · ${d.huespedTelefono} · ${d.huespedEmail}`;
  switch (plantilla) {
    case "nueva_solicitud":
      return {
        asunto: `${prefijo}Nueva solicitud de ${d.huespedNombre} · ${d.cabana} · ${d.llegada}`,
        texto: [
          `Tienes una nueva solicitud de reserva (${d.codigo}).`,
          estadia,
          huesped,
          `Total ${d.total} · abono ${d.abono}.`,
          d.mensaje ? `Mensaje del huésped: «${d.mensaje}»` : "El huésped no dejó mensaje.",
          d.limite ? `Respóndela antes del ${d.limite}; si no, expira y las fechas se liberan.` : "",
          `Aprobar o rechazar: ${d.urlPanel}`,
        ],
      };
    case "recordatorio_solicitud":
      return {
        asunto: `${prefijo}Recuerda responder la solicitud de ${d.huespedNombre} · ${d.cabana}`,
        texto: [
          `La solicitud ${d.codigo} sigue esperando tu respuesta${d.limite ? ` y expira el ${d.limite}` : ""}.`,
          estadia,
          huesped,
          `Aprobar o rechazar: ${d.urlPanel}`,
        ],
      };
    case "pago_expirado":
      return {
        asunto: `${prefijo}${d.huespedNombre} no pagó a tiempo · ${d.cabana}`,
        texto: [
          `El link de pago de la solicitud ${d.codigo} venció sin pago. Las fechas quedaron libres.`,
          estadia,
          huesped,
          d.urlPanel,
        ],
      };
    case "resena_huesped_pendiente":
      return {
        asunto: `${prefijo}¿Cómo fue ${d.huespedNombre} como huésped? · ${d.cabana}`,
        texto: [
          `${d.huespedNombre} terminó su estadía (${d.codigo}).`,
          estadia,
          "Deja tu reseña privada del huésped: solo la ven los administradores de tu propiedad y, después de publicada, el huésped. Tienes 30 días desde el check-out.",
          `Escribirla: ${d.urlPanel}`,
        ],
      };
  }
}

const ESPERAS_MS = [0, 1_000, 3_000];

/** Intenta enviar hasta 3 veces (Resend puede fallar por un momento). Devuelve el último error. */
async function conReintentos(enviar: () => Promise<{ error: unknown }>): Promise<ResultadoAviso> {
  let ultimo = "";
  for (const espera of ESPERAS_MS) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      const { error } = await enviar();
      if (!error) return { ok: true };
      ultimo = typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, error: ultimo || "error desconocido" };
}

const DIRECCION_REMITENTE = process.env.EMAIL_REMITENTE ?? "reservas@reservas.solucionesdys.cl";

function clienteResend() {
  const clave = process.env.RESEND_API_KEY;
  return clave ? new Resend(clave) : null;
}

/** Destinatario descartado (sin email válido o de ejemplo): no es una falla, no hay a quién enviar. */
const SIN_DESTINATARIO: ResultadoAviso = { ok: true };

/** Avisa al huésped por el canal indicado. Nunca lanza. */
export async function notificarHuesped(canal: CanalAviso, plantilla: PlantillaHuesped, d: DatosAviso): Promise<ResultadoAviso> {
  if (canal !== "email") return { ok: false, error: `Canal ${canal} no disponible` };
  const resend = clienteResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };
  if (!esEmailEnviable(d.huespedEmail)) return SIN_DESTINATARIO;

  const c = contenidoHuesped(plantilla, d);
  return conReintentos(() =>
    resend.emails.send({
      from: `${d.propiedad} <${DIRECCION_REMITENTE}>`,
      to: d.huespedEmail,
      replyTo: esEmailEnviable(d.emailPropiedad) ? d.emailPropiedad : undefined,
      subject: c.asunto,
      react: AvisoSolicitud({
        codigo: d.codigo,
        propiedad: d.propiedad,
        cabana: d.cabana,
        titulo: c.titulo,
        parrafos: c.parrafos,
        boton: c.boton,
        llegada: d.llegada,
        salida: d.salida,
        noches: d.noches,
        personas: d.personas,
        total: d.total,
        abono: d.abono,
        prueba: d.prueba,
        ...(PLANTILLAS_RESENA.includes(plantilla) ? { etiqueta: "Reserva", mostrarPrecio: false } : {}),
      }),
    }),
  );
}

/**
 * Link de acceso del huésped a sus datos y reseñas (Ley 21.719). Texto plano. Nunca lanza.
 * No depende de una reserva: el huésped lo pide con su email desde /mis-datos.
 */
export async function enviarLinkAccesoHuesped(email: string, url: string): Promise<ResultadoAviso> {
  const resend = clienteResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };
  if (!esEmailEnviable(email)) return SIN_DESTINATARIO;
  return conReintentos(() =>
    resend.emails.send({
      from: `Reservas Cabañas Sur <${DIRECCION_REMITENTE}>`,
      to: email,
      subject: "Tu link para ver tus datos y reseñas",
      text: [
        "Pediste ver la información que guardamos sobre ti y las reseñas que los anfitriones escribieron sobre tus estadías.",
        `Entra aquí (el link vence en 24 horas): ${url}`,
        "Si no lo pediste tú, ignora este correo: nadie puede entrar sin este link.",
      ].join("\n\n"),
    }),
  );
}

/** Avisa al dueño (email de la propiedad). Nunca lanza. */
export async function notificarDueno(plantilla: PlantillaDueno, d: DatosAviso): Promise<ResultadoAviso> {
  const resend = clienteResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };
  if (!esEmailEnviable(d.emailPropiedad)) return SIN_DESTINATARIO;

  const c = contenidoDueno(plantilla, d);
  return conReintentos(() =>
    resend.emails.send({
      from: `${d.propiedad} <${DIRECCION_REMITENTE}>`,
      to: d.emailPropiedad,
      replyTo: esEmailEnviable(d.huespedEmail) ? d.huespedEmail : undefined,
      subject: c.asunto,
      text: c.texto.filter(Boolean).join("\n"),
    }),
  );
}
