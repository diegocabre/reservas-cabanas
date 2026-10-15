"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requerirAdmin } from "@/lib/admin";
import { aprobarSolicitud, avisarHuesped, rechazarSolicitud, registrarWhatsappAbierto, renovarLinkPago } from "@/lib/aprobacion";
import { obtenerReserva } from "@/lib/panel-datos";
import { enviarEmailsReservaConfirmada } from "@/lib/emails";
import { MEDIOS_PAGO_SALDO } from "@/lib/estados-reserva";
import { hoyEnChile } from "@/lib/formato";
import { cancelarReserva, confirmarReserva, marcarRevisado, registrarPago } from "@/lib/panel-acciones";

// Server Actions del detalle de reserva. Cada una vuelve a verificar al admin (las acciones son
// endpoints públicos: el layout no las protege), valida con Zod y delega en lib/panel-acciones.ts,
// que revalida el estado contra la base dentro de una transacción con RLS y deja la auditoría.

export type EstadoAccion = { error?: string };

const codigo = z.string().trim().min(3).max(40);

function terminar(cod: string, hecho: string): never {
  revalidatePath("/admin", "layout");
  redirect(`/admin/reservas/${encodeURIComponent(cod)}?hecho=${hecho}`);
}

export async function accionConfirmar(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const cod = codigo.safeParse(formData.get("codigo"));
  if (!cod.success) return { error: "Reserva inválida." };

  const r = await confirmarReserva(admin, cod.data);
  if (!r.ok) return { error: r.error };
  // Mismo email que cuando confirma Mercado Pago: confirmación al huésped y aviso al dueño.
  after(() => enviarEmailsReservaConfirmada(cod.data));
  terminar(cod.data, "confirmada");
}

export async function accionCancelar(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const cod = codigo.safeParse(formData.get("codigo"));
  if (!cod.success) return { error: "Reserva inválida." };

  const r = await cancelarReserva(admin, cod.data, String(formData.get("motivo") ?? ""));
  if (!r.ok) return { error: r.error };
  terminar(cod.data, "cancelada");
}

const esquemaPago = z.object({
  codigo,
  // El dueño puede escribir "120.000" o "$120000": se toman solo los dígitos.
  monto: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(1, { error: "Escribe el monto." }))
    .transform(Number),
  medio: z.enum(MEDIOS_PAGO_SALDO, { error: "Elige cómo se pagó." }),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elige la fecha del pago." }),
});

export async function accionRegistrarPago(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const datos = esquemaPago.safeParse({
    codigo: formData.get("codigo"),
    monto: String(formData.get("monto") ?? ""),
    medio: formData.get("medio"),
    fecha: formData.get("fecha"),
  });
  if (!datos.success) return { error: datos.error.issues[0].message };

  const { codigo: cod, ...pago } = datos.data;
  const r = await registrarPago(admin, cod, pago, hoyEnChile());
  if (!r.ok) return { error: r.error };
  terminar(cod, "pago");
}

export async function accionMarcarRevisado(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const cod = codigo.safeParse(formData.get("codigo"));
  if (!cod.success) return { error: "Reserva inválida." };

  const r = await marcarRevisado(admin, cod.data, String(formData.get("nota") ?? ""));
  if (!r.ok) return { error: r.error };
  terminar(cod.data, "revisado");
}

// ---------------------------------------------------------------------------------------------
// Solicitudes (cabañas con aprobación manual): lib/aprobacion.ts.
// ---------------------------------------------------------------------------------------------

export async function accionAprobar(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const cod = codigo.safeParse(formData.get("codigo"));
  if (!cod.success) return { error: "Reserva inválida." };

  const r = await aprobarSolicitud(admin, cod.data);
  if (!r.ok) return { error: r.error };
  // Solo la aprobación que cambió el estado envía el correo: un doble clic no manda dos.
  if (r.nuevo) after(() => avisarHuesped(cod.data, "solicitud_aprobada"));
  terminar(cod.data, "aprobada");
}

export async function accionRechazar(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const cod = codigo.safeParse(formData.get("codigo"));
  if (!cod.success) return { error: "Reserva inválida." };

  const r = await rechazarSolicitud(admin, cod.data, String(formData.get("motivo") ?? ""));
  if (!r.ok) return { error: r.error };
  if (r.nuevo) after(() => avisarHuesped(cod.data, "solicitud_rechazada", r.motivo));
  terminar(cod.data, "rechazada");
}

export async function accionRenovarLink(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const cod = codigo.safeParse(formData.get("codigo"));
  if (!cod.success) return { error: "Reserva inválida." };

  const r = await renovarLinkPago(admin, cod.data);
  if (!r.ok) return { error: r.error };
  after(() => avisarHuesped(cod.data, "solicitud_aprobada"));
  terminar(cod.data, "link");
}

/** Reenvía el correo con el link de pago (el mismo link; no crea otro). */
export async function accionReenviarCorreo(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await requerirAdmin();
  const cod = codigo.safeParse(formData.get("codigo"));
  if (!cod.success) return { error: "Reserva inválida." };

  // Solo reservas de sus propiedades (filtro + RLS), y solo con un link vigente.
  const r = await obtenerReserva(admin, cod.data);
  if (!r || r.estado !== "aprobada_pendiente_pago") return { error: "Esta reserva no está esperando pago." };
  const enviado = await avisarHuesped(cod.data, "solicitud_aprobada");
  if (!enviado.ok) return { error: `No se pudo enviar el correo: ${enviado.error}` };
  terminar(cod.data, "correo");
}

/** El dueño abrió WhatsApp con el link de pago: se registra la hora ("abierto", no "entregado"). */
export async function accionWhatsappAbierto(cod: string): Promise<void> {
  const admin = await requerirAdmin();
  const c = codigo.safeParse(cod);
  if (!c.success) return;
  if (await registrarWhatsappAbierto(admin, c.data)) revalidatePath(`/admin/reservas/${encodeURIComponent(c.data)}`);
}
