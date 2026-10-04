import { expirarReservasVencidas } from "@/lib/reservas";

/**
 * Cron de Vercel: cancela las reservas pendientes de pago que vencieron.
 * Vercel envía "Authorization: Bearer <CRON_SECRET>" si la variable CRON_SECRET existe en el proyecto.
 *
 * Es solo orden de la base: las pendientes vencidas ya no bloquean fechas aunque el cron no corra
 * (la disponibilidad las ignora y crearReservaWeb las cancela antes de insertar).
 */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const expiradas = await expirarReservasVencidas();
  return Response.json({ expiradas });
}
