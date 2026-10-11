import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/admin";
import { leerFiltros } from "@/lib/filtros-reservas";
import { hoyEnChile } from "@/lib/formato";
import { buscarReservas, cabanasDelAdmin } from "@/lib/panel-datos";
import { VistaLista } from "./vista-lista";

export const metadata: Metadata = { title: "Reservas" };

export default async function PaginaReservas({ searchParams }: PageProps<"/admin/reservas">) {
  const admin = await requerirAdmin();
  const hoy = hoyEnChile();
  // Los filtros vienen de la URL: se validan y cualquier valor raro se descarta (lib/filtros-reservas.ts).
  const filtros = leerFiltros(await searchParams, hoy);
  const [{ reservas, hayMas }, cabanas] = await Promise.all([buscarReservas(admin, filtros), cabanasDelAdmin(admin)]);

  return <VistaLista filtros={filtros} hoy={hoy} reservas={reservas} hayMas={hayMas} cabanas={cabanas} />;
}
