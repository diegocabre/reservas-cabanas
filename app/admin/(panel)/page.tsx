import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/admin";
import { hoyEnChile } from "@/lib/formato";
import { datosResumen } from "@/lib/panel-datos";
import { datosPendientes } from "@/lib/publicacion";
import { enModoPrueba } from "@/lib/sitio";
import { VistaResumen } from "./vista-resumen";

export const metadata: Metadata = { title: "Resumen del día" };

export default async function PaginaResumen({ searchParams }: PageProps<"/admin">) {
  const admin = await requerirAdmin();
  const { propiedad: slug } = await searchParams;

  // Con varias propiedades, se elige con ?propiedad=slug. Una ajena no existe para este admin.
  const elegida = slug ? admin.propiedades.find((p) => p.slug === slug) : admin.propiedades[0];
  if (!elegida) notFound();

  // "Hoy" es el día en Chile, no el del servidor (Vercel corre en UTC).
  const hoy = hoyEnChile();
  const datos = await datosResumen(admin, elegida.id, hoy);
  if (!datos) notFound();

  return (
    <VistaResumen
      hoy={hoy}
      propiedad={datos.propiedad.nombre}
      pendientes={datosPendientes(datos.propiedad)}
      modoPrueba={enModoPrueba()}
      reservas={datos.reservas}
      bloqueos={datos.bloqueos}
      cabanasActivas={datos.cabanasActivas}
      propiedades={admin.propiedades}
      elegidaId={elegida.id}
      solicitudes={datos.solicitudes}
      cabanasSinAprobacionConSolicitudes={datos.cabanasSinAprobacionConSolicitudes}
    />
  );
}
