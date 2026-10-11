"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requerirAdmin } from "@/lib/admin";
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
