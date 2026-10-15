import { redirect } from "next/navigation";
import { requerirAdmin } from "@/lib/admin";
import { normalizarCodigo } from "@/lib/codigo";
import { pedirResenaPorWhatsapp } from "@/lib/resenas";

/**
 * "Pedir reseña por WhatsApp": arma el link wa.me con el MISMO link de la invitación por correo,
 * registra la hora en que el dueño lo abrió (ciclo_resena.whatsapp_abierto_en) y redirige.
 * Un enlace (no un botón con JavaScript) para que el navegador del celular abra WhatsApp sin bloqueos.
 */
export async function GET(_request: Request, { params }: RouteContext<"/admin/resenas/whatsapp/[codigo]">) {
  const admin = await requerirAdmin();
  const { codigo } = await params;
  const r = await pedirResenaPorWhatsapp(admin, normalizarCodigo(decodeURIComponent(codigo)));
  if (!r.ok) redirect("/admin/resenas?error=whatsapp");
  return Response.redirect(r.url, 302);
}
