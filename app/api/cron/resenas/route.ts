import { procesarResenas } from "@/lib/resenas";

/**
 * Cron de Vercel (una vez al día, 13:00 UTC ≈ 10:00 en Chile): invita a dejar la reseña al día
 * siguiente del check-out, recuerda a los 7 días, avisa al dueño y publica lo que desbloqueó el doble
 * ciego (lib/resenas.ts). Idempotente. Solo envía correos en propiedades con reseñas activas (/admin/plataforma).
 * Vercel envía "Authorization: Bearer <CRON_SECRET>", igual que en /api/cron/expirar-reservas.
 */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  return Response.json(await procesarResenas());
}
