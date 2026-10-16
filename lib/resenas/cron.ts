// Reseñas: cron diario de invitaciones, recordatorios y desbloqueo.

import { avisarDueno, avisarHuesped } from "@/lib/aprobacion";
import { db } from "@/lib/db";
import { hoyEnChile } from "@/lib/formato";
import { aFechaIso } from "@/lib/precios";
import {
  DIAS_PLAZO_RESENA,
  resenasHuespedActivas,
  sumarDiasIso,
  tocaInvitar,
  tocaRecordatorio,
} from "@/lib/resenas-reglas";
import {
  ESTADOS_RESENABLES,
  fecha,
  asegurarHuesped,
  asegurarCiclo,
  urlResenaDeCiclo,
  evaluarDesbloqueo,
} from "@/lib/resenas/comun";

// ---------------------------------------------------------------------------------------------
// Cron (app/api/cron/resenas): invitaciones, recordatorios y desbloqueo, en las propiedades con
// reseñas activas (las demás no reciben correos; el desbloqueo de lo ya escrito sigue en todas). Idempotente: cada envío se
// "reserva" marcando su columna solo si estaba en null, así dos corridas no lo envían dos veces.
// Los tokens no se borran al vencer: se rechazan por fecha (token_expira_en).
// ---------------------------------------------------------------------------------------------

export async function procesarResenas(ahora = new Date()) {
  const hoy = hoyEnChile(ahora);
  const marcar = async (id: string, campo: "invitacionEnviadaEn" | "recordatorioEn" | "recordatorioDuenoEn") =>
    (await db.cicloResena.updateMany({ where: { id, [campo]: null }, data: { [campo]: ahora } })).count === 1;

  let invitaciones = 0;
  let recordatorios = 0;
  let recordatoriosDueno = 0;
  const estadias = await db.reserva.findMany({
    where: {
      estado: { in: [...ESTADOS_RESENABLES] },
      checkOut: { gte: fecha(sumarDiasIso(hoy, -DIAS_PLAZO_RESENA)), lt: fecha(hoy) },
      // Solo propiedades con reseñas activas y no suspendidas.
      cabana: { demo: false, propiedad: { suspendida: false, resenas: { not: "apagadas" } } },
    },
    select: {
      id: true,
      codigo: true,
      cabana: { select: { propiedad: { select: { resenas: true } } } },
      checkOut: true,
      huespedId: true,
      huespedEmail: true,
      huespedTelefono: true,
      huespedNombre: true,
      resenaCabana: { select: { id: true } },
      resenaHuesped: { select: { id: true } },
    },
  });
  for (const r of estadias) {
    const checkOut = aFechaIso(r.checkOut);
    await asegurarHuesped(db, r);
    const ciclo = await asegurarCiclo(db, r.id, checkOut);
    const url = () => urlResenaDeCiclo(ciclo);

    if (!r.resenaCabana && !ciclo.invitacionEnviadaEn && tocaInvitar(checkOut, hoy) && (await marcar(ciclo.id, "invitacionEnviadaEn"))) {
      invitaciones++;
      await avisarHuesped(r.codigo, "invitacion_resena", null, url());
    } else if (
      tocaRecordatorio({ checkOut, invitacionEnviadaEn: ciclo.invitacionEnviadaEn, recordatorioEn: ciclo.recordatorioEn, respondio: !!r.resenaCabana }, hoy) &&
      (await marcar(ciclo.id, "recordatorioEn"))
    ) {
      recordatorios++;
      await avisarHuesped(r.codigo, "recordatorio_resena", null, url());
    }

    // Al dueño, al día siguiente del check-out (misma ventana que la invitación).
    if (
      resenasHuespedActivas(r.cabana.propiedad.resenas) &&
      !r.resenaHuesped &&
      !ciclo.recordatorioDuenoEn &&
      tocaInvitar(checkOut, hoy) &&
      (await marcar(ciclo.id, "recordatorioDuenoEn"))
    ) {
      recordatoriosDueno++;
      await avisarDueno(r.codigo, "resena_huesped_pendiente");
    }
  }

  let desbloqueos = 0;
  for (const c of await db.cicloResena.findMany({ where: { desbloqueadoEn: null }, select: { reservaId: true } })) {
    if (await evaluarDesbloqueo(c.reservaId, ahora)) desbloqueos++;
  }

  return { invitaciones, recordatorios, recordatoriosDueno, desbloqueos };
}
