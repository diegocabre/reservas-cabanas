import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/admin";
import { normalizarCodigo } from "@/lib/codigo";
import { hoyEnChile } from "@/lib/formato";
import { detalleReserva } from "@/lib/panel-datos";
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

  return <VistaDetalle r={reserva} hecho={typeof hecho === "string" ? hecho : undefined} hoy={hoyEnChile()} />;
}
