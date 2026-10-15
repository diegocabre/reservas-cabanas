import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/admin";
import { normalizarCodigo } from "@/lib/codigo";
import { hoyEnChile } from "@/lib/formato";
import { detalleReserva } from "@/lib/panel-datos";
import { historialHuesped, resenasDeReserva } from "@/lib/resenas";
import { resenasHuespedActivas } from "@/lib/resenas-reglas";
import { VistaDetalle } from "./vista-detalle";

export async function generateMetadata({ params }: PageProps<"/admin/reservas/[codigo]">): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Reserva ${normalizarCodigo(decodeURIComponent(codigo))}` };
}

export default async function PaginaDetalleReserva({ params, searchParams }: PageProps<"/admin/reservas/[codigo]">) {
  const admin = await requerirAdmin();
  const { codigo } = await params;
  const { hecho } = await searchParams;

  // Solo reservas de las propiedades del admin (filtro + RLS): una ajena es un 404, igual que una inexistente.
  const reserva = await detalleReserva(admin, normalizarCodigo(decodeURIComponent(codigo)));
  if (!reserva) notFound();

  // Reseña privada del huésped e historial con este dueño (solo con las reseñas del huésped activas).
  const hoy = hoyEnChile();
  const resenas = resenasHuespedActivas()
    ? {
        estado: await resenasDeReserva(admin, reserva.codigo),
        historial: await historialHuesped(admin, { email: reserva.huespedEmail, telefono: reserva.huespedTelefono }, hoy),
      }
    : null;

  return <VistaDetalle r={reserva} hecho={typeof hecho === "string" ? hecho : undefined} hoy={hoy} resenas={resenas} />;
}
