import { procesarSolicitudes } from "@/lib/aprobacion";

/**
 * Cron de Vercel (cada 30 minutos, plan Pro): cancela las reservas pendientes de pago que vencieron
 * y, para las cabañas con aprobación manual, expira solicitudes sin respuesta o sin pago, avisa al
 * huésped y al dueño, y envía los recordatorios (lib/aprobacion.ts). Idempotente.
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

  return Response.json(await procesarSolicitudes());
}
