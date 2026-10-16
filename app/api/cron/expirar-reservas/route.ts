import { procesarSolicitudes } from "@/lib/aprobacion";
import { limpiarIntentos } from "@/lib/limites";
import { detalleError, registrar } from "@/lib/registro";

/**
 * Cron de Vercel (cada 30 minutos, plan Pro): cancela las reservas pendientes de pago que vencieron
 * y, para las cabañas con aprobación manual, expira solicitudes sin respuesta o sin pago, avisa al
 * huésped y al dueño, y envía los recordatorios (lib/aprobacion.ts). Idempotente.
 * Vercel envía "Authorization: Bearer <CRON_SECRET>" si la variable CRON_SECRET existe en el proyecto.
 *
 * Es solo orden de la base: las pendientes vencidas ya no bloquean fechas aunque el cron no corra
 * (la disponibilidad las ignora y crearReservaWeb las cancela antes de insertar).
 * También borra los intentos públicos de más de 48 horas (lib/limites.ts).
 */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = { ...(await procesarSolicitudes()), intentosBorrados: await limpiarIntentos() };
    registrar("info", "cron_ejecutado", { cron: "expirar-reservas", ...resultado });
    return Response.json(resultado);
  } catch (e) {
    registrar("error", "cron_fallido", { cron: "expirar-reservas", detalle: detalleError(e) });
    return Response.json({ error: "Falló el cron" }, { status: 500 });
  }
}
