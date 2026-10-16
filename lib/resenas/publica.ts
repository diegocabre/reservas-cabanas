// Reseñas: lo que lee la página pública de la cabaña.

import { db } from "@/lib/db";
import { nombrePublico, type ResenaPublica } from "@/lib/resenas-reglas";

// ---------------------------------------------------------------------------------------------
// Página pública de la cabaña
// ---------------------------------------------------------------------------------------------

/** Máximo de reseñas que trae la página de la cabaña. */
export const MAXIMO_RESENAS_PUBLICAS = 100;

/**
 * Reseñas PUBLICADAS de una cabaña, sin datos personales (solo nombre de pila). Lo único que lee la
 * parte pública: ni retenidas, ni ocultas, ni de reservas de prueba (es_prueba: nunca llegan a la
 * página ni al JSON-LD). shortcut: tope de 100, paginar en la base si alguna cabaña lo pasa.
 */
export async function resenasPublicas(cabanaId: string): Promise<ResenaPublica[]> {
  const filas = await db.resenaCabana.findMany({
    where: {
      cabanaId,
      estado: "publicada",
      reserva: { esPrueba: false },
    },
    select: {
      id: true,
      nombrePublico: true,
      comentario: true,
      publicadaEn: true,
      limpieza: true,
      ubicacion: true,
      comunicacion: true,
      veracidad: true,
      calidadPrecio: true,
      respuesta: { select: { texto: true } },
    },
    orderBy: { publicadaEn: "desc" },
    take: MAXIMO_RESENAS_PUBLICAS,
  });
  return filas.map(({ nombrePublico: nombre, respuesta, publicadaEn, ...r }) => ({
    ...r,
    nombre,
    publicadaEn: publicadaEn ?? new Date(0),
    respuesta: respuesta?.texto ?? null,
  }));
}
