import { db } from "@/lib/db";
import { MINUTOS_PARA_PAGAR, nochesOcupadas, plazoVencido, reservaOcupa, validarEstadia } from "@/lib/disponibilidad";
import { ESTADOS_CON_PLAZO, ESTADOS_QUE_OCUPAN } from "@/lib/estados-reserva";
import { limites } from "@/lib/limites";
import { generarCodigoReserva } from "@/lib/codigo";
import { cerrojoCabana, codigoPostgres, TRASLAPE_RESERVA } from "@/lib/errores-db";
import { hoyEnChile, ocultarEmail } from "@/lib/formato";
import { enModoPrueba } from "@/lib/sitio";
import { aFechaIso, calcularAbono, calcularPrecio, ErrorPrecio, nochesEntre, type TarifaPrecio } from "@/lib/precios";
import { tieneCuentaConectada } from "@/lib/mercadopago-cuentas";
import { bloqueoReserva, SELECT_PUBLICACION } from "@/lib/publicacion";
import { enlaceWhatsapp, mensajeConsultaReserva } from "@/lib/whatsapp";
import type { DatosReserva } from "@/lib/reserva-esquema";
import { registrar } from "@/lib/registro";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Cuántos meses hacia adelante se puede reservar. */
export const MESES_RESERVABLES = 12;

/** Fecha ISO + n meses (sin hora, en UTC). */
function sumarMeses(iso: string, meses: number): string {
  const f = d(iso);
  f.setUTCMonth(f.getUTCMonth() + meses);
  return aFechaIso(f);
}

const SELECT_TARIFA = { personasDesde: true, personasHasta: true, nochesDesde: true, precioNoche: true } as const;

/**
 * Todo lo que necesita el calendario de reserva: cabaña, tarifas (para cotizar en el
 * navegador con la misma función que el servidor) y noches ocupadas desde hoy. Sin caché: la disponibilidad cambia con cada reserva.
 */
export async function obtenerDatosReserva(propiedadSlug: string, cabanaSlug: string) {
  const hoy = hoyEnChile();
  const ahora = new Date();
  const cabana = await db.cabana.findFirst({
    where: { slug: cabanaSlug, activa: true, propiedad: { slug: propiedadSlug, suspendida: false } },
    select: {
      nombre: true,
      slug: true,
      capacidad: true,
      minNoches: true,
      fotos: true,
      demo: true,
      requiereAprobacion: true,
      horasRespuestaAprobacion: true,
      propiedad: { select: { id: true, nombre: true, slug: true, abonoPct: true, abonoNoches: true, resenas: true, ...SELECT_PUBLICACION } },
      tarifas: { select: SELECT_TARIFA },
      reservas: {
        where: { estado: { in: [...ESTADOS_QUE_OCUPAN] }, checkOut: { gt: d(hoy) } },
        select: { checkIn: true, checkOut: true, estado: true, expiraEn: true },
      },
      bloqueos: { where: { hasta: { gt: d(hoy) } }, select: { desde: true, hasta: true } },
    },
  });
  if (!cabana) return null;

  const { reservas, bloqueos, propiedad, ...resto } = cabana;
  const ocupadas = nochesOcupadas([
    ...reservas.filter((r) => reservaOcupa(r, ahora)).map((r) => ({ desde: r.checkIn, hasta: r.checkOut })),
    ...bloqueos,
  ]);

  return {
    ...resto,
    // Solo lo que el formulario muestra: las instrucciones de llegada no viajan al navegador.
    propiedad: {
      nombre: propiedad.nombre,
      slug: propiedad.slug,
      abonoPct: propiedad.abonoPct,
      abonoNoches: propiedad.abonoNoches,
      resenas: propiedad.resenas, // para el aviso de privacidad
    },
    hoy,
    ultimoDia: sumarMeses(hoy, MESES_RESERVABLES),
    bloqueo: bloqueoReserva(
      { demo: cabana.demo, propiedad },
      enModoPrueba(),
      enModoPrueba() || (await tieneCuentaConectada(propiedad.id)),
    ),
    reservaWhatsapp: enlaceWhatsapp(propiedad.whatsapp, mensajeConsultaReserva(cabana.nombre)),
    ocupadas: [...ocupadas].filter((n) => n >= hoy).sort(),
  };
}

export type DatosCalendario = NonNullable<Awaited<ReturnType<typeof obtenerDatosReserva>>>;

type ClienteDb = Pick<typeof db, "reserva">;

/**
 * Libera las fechas de las reservas cuyo plazo venció:
 * - `pendiente_pago` (no pagó en 30 minutos) → `cancelada`, como siempre.
 * - Solicitudes `pendiente_aprobacion` (el dueño no respondió) y `aprobada_pendiente_pago` (no pagó el
 *   link) → `expirada`. Los avisos de expiración los envía el cron (lib/aprobacion.ts), marcando
 *   `expiracion_avisada_en`, así no importa quién la expiró.
 * La usan el cron (todas las cabañas) y crearReservaWeb (una cabaña, dentro de su transacción).
 * Devuelve cuántas reservas expiró.
 */
export async function expirarReservasVencidas(cliente: ClienteDb = db, ahora = new Date(), cabanaId?: string) {
  const deLaCabana = cabanaId ? { cabanaId } : {};
  const canceladas = await cliente.reserva.updateMany({
    where: { estado: "pendiente_pago", expiraEn: { lt: ahora }, ...deLaCabana },
    data: { estado: "cancelada" },
  });
  const expiradas = await cliente.reserva.updateMany({
    where: { estado: { in: ["pendiente_aprobacion", "aprobada_pendiente_pago"] }, expiraEn: { lt: ahora }, ...deLaCabana },
    data: { estado: "expirada" },
  });
  return canceladas.count + expiradas.count;
}

export type ResultadoReserva =
  | { ok: true; codigo: string; estado: "pendiente_pago" | "pendiente_aprobacion" }
  | { ok: false; error: string };

const FECHAS_TOMADAS = "Alguien acaba de reservar esas fechas. Por favor elige otras.";

export const MENSAJE_PENDIENTES =
  "Ya tienes reservas pendientes en esta cabaña. Págalas o espera a que venzan antes de pedir otra; puedes verlas en Buscar mi reserva.";

class FechasNoDisponibles extends Error {}
class DemasiadasPendientes extends Error {}

/**
 * Crea una reserva web: `pendiente_pago` (30 minutos para pagar), o `pendiente_aprobacion` si la
 * cabaña pide aprobar las reservas (sin cobro; el dueño tiene `horas_respuesta_aprobacion`). Recalcula precio, abono y disponibilidad
 * en el servidor: no confía en nada de lo que calculó el navegador.
 */
export async function crearReservaWeb(datos: DatosReserva): Promise<ResultadoReserva> {
  const hoy = hoyEnChile();
  if (datos.checkIn < hoy) return { ok: false, error: "La fecha de llegada ya pasó. Elige otra." };
  if (datos.checkIn > sumarMeses(hoy, MESES_RESERVABLES)) {
    return { ok: false, error: `Por ahora se puede reservar hasta ${MESES_RESERVABLES} meses hacia adelante.` };
  }
  // Rango absurdo (un script, no un huésped): se rechaza antes de tocar la base.
  const { maxNoches } = limites();
  if (nochesEntre(datos.checkIn, datos.checkOut).length > maxNoches) {
    return { ok: false, error: `Las reservas en línea son de hasta ${maxNoches} noches. Para estadías más largas, escríbele a la cabaña.` };
  }

  const cabana = await db.cabana.findFirst({
    // Una propiedad suspendida no recibe reservas (el servidor la rechaza aunque alguien tenga el link).
    where: { slug: datos.cabana, activa: true, propiedad: { slug: datos.propiedad, suspendida: false } },
    select: {
      id: true,
      nombre: true,
      capacidad: true,
      minNoches: true,
      demo: true,
      requiereAprobacion: true,
      horasRespuestaAprobacion: true,
      propiedad: { select: { id: true, abonoPct: true, abonoNoches: true, ...SELECT_PUBLICACION } },
      tarifas: { select: SELECT_TARIFA },
    },
  });
  if (!cabana) return { ok: false, error: "Esta cabaña no está disponible para reservas." };

  // Sin Mercado Pago conectado (fuera del modo prueba) el huésped no podría pagar: no se reserva en línea.
  const bloqueo = bloqueoReserva(cabana, enModoPrueba(), enModoPrueba() || (await tieneCuentaConectada(cabana.propiedad.id)));
  if (bloqueo) return { ok: false, error: bloqueo };

  // Precio y abono se recalculan aquí con las tarifas de la base; el navegador solo los muestra.
  // calcularPrecio también valida estadía mínima (min_noches) y personas (1 a la capacidad).
  let cotizacion: ReturnType<typeof calcularPrecio>;
  try {
    cotizacion = calcularPrecio({
      cabana: { nombre: cabana.nombre, minNoches: cabana.minNoches, capacidad: cabana.capacidad },
      tarifas: cabana.tarifas satisfies TarifaPrecio[],
      checkIn: datos.checkIn,
      checkOut: datos.checkOut,
      personas: datos.adultos + datos.ninos,
    });
  } catch (e) {
    if (e instanceof ErrorPrecio) return { ok: false, error: e.message };
    throw e;
  }
  const { total } = cotizacion;
  const { abono } = calcularAbono(total, cotizacion.precioNoche, cabana.propiedad);

  const { prefijoCodigo } = await db.propiedad.findUniqueOrThrow({
    where: { id: cabana.propiedad.id },
    select: { prefijoCodigo: true },
  });
  const ahora = new Date();
  // La configuración se lee de la cabaña al crear: cambiarla después no afecta reservas ya hechas.
  const reserva = {
    cabanaId: cabana.id,
    datos,
    total,
    abono,
    ahora,
    estado: cabana.requiereAprobacion ? ("pendiente_aprobacion" as const) : ("pendiente_pago" as const),
    expiraEn: new Date(
      ahora.getTime() + (cabana.requiereAprobacion ? cabana.horasRespuestaAprobacion * 60 : MINUTOS_PARA_PAGAR) * 60_000,
    ),
  };

  // Código aleatorio. Si por azar ya existe (casi imposible: 31^8 combinaciones), se reintenta con otro.
  for (let intento = 1; ; intento++) {
    try {
      return await insertarReservaWeb(generarCodigoReserva(prefijoCodigo), reserva);
    } catch (e) {
      if (esCodigoRepetido(e) && intento < 5) continue;
      throw e;
    }
  }
}

async function insertarReservaWeb(
  codigo: string,
  { cabanaId, datos, total, abono, ahora, estado, expiraEn }: {
    cabanaId: string;
    datos: DatosReserva;
    total: number;
    abono: number;
    ahora: Date;
    estado: "pendiente_pago" | "pendiente_aprobacion";
    expiraEn: Date;
  },
): Promise<ResultadoReserva> {
  try {
    await db.$transaction(async (tx) => {
      // Mientras dure la transacción, nadie más puede bloquear o reservar esta cabaña.
      await cerrojoCabana(tx, cabanaId);
      // Las reservas pendientes que ya vencieron liberan sus fechas.
      await expirarReservasVencidas(tx, ahora, cabanaId);

      // Un mismo email o teléfono no puede retener fechas con más de N reservas pendientes en la
      // cabaña (las vencidas ya se liberaron arriba): así un script no ocupa todo el calendario.
      const { pendientesPorContacto } = limites();
      const pendientes = (contacto: { huespedEmail: string } | { huespedTelefono: string }) =>
        tx.reserva.count({ where: { cabanaId, estado: { in: [...ESTADOS_CON_PLAZO] }, ...contacto } });
      if (
        (await pendientes({ huespedEmail: datos.email })) >= pendientesPorContacto ||
        (await pendientes({ huespedTelefono: datos.telefono })) >= pendientesPorContacto
      ) {
        throw new DemasiadasPendientes();
      }

      // Los bloqueos no están en la restricción de la base: se revisan aquí.
      const bloqueos = await tx.bloqueo.findMany({
        where: { cabanaId, desde: { lt: d(datos.checkOut) }, hasta: { gt: d(datos.checkIn) } },
        select: { desde: true, hasta: true },
      });
      if (!validarEstadia(datos.checkIn, datos.checkOut, nochesOcupadas(bloqueos)).disponible) {
        throw new FechasNoDisponibles();
      }

      // Si otra reserva activa se traslapa, Postgres rechaza el INSERT (reserva_sin_traslape).
      await tx.reserva.create({
        data: {
          codigo,
          cabanaId,
          checkIn: d(datos.checkIn),
          checkOut: d(datos.checkOut),
          adultos: datos.adultos,
          ninos: datos.ninos,
          huespedNombre: datos.nombre,
          huespedEmail: datos.email,
          huespedTelefono: datos.telefono,
          huespedRut: datos.rut,
          total,
          abono,
          estado,
          origen: "web",
          expiraEn,
          // En modo prueba la reserva queda marcada (columna es_prueba), para identificarla y limpiarla después.
          // notas es solo el texto del huésped: nunca se interpreta.
          esPrueba: enModoPrueba(),
          notas: datos.notas || null,
        },
      });
    });
    return { ok: true, codigo, estado };
  } catch (e) {
    if (e instanceof DemasiadasPendientes) {
      registrar("warn", "limite_pendientes", { cabanaId });
      return { ok: false, error: MENSAJE_PENDIENTES };
    }
    if (e instanceof FechasNoDisponibles || codigoPostgres(e) === TRASLAPE_RESERVA) {
      return { ok: false, error: FECHAS_TOMADAS };
    }
    throw e;
  }
}

/** ¿El error es por un código de reserva que ya existe? (índice único de `codigo`). */
function esCodigoRepetido(e: unknown): boolean {
  const err = e as { code?: string; meta?: unknown };
  const sobreCodigo = JSON.stringify(err?.meta ?? {}).includes("codigo");
  return (err?.code === "P2002" || codigoPostgres(e) === "23505") && sobreCodigo;
}

/**
 * ¿Existe una reserva con este código Y este email? Para "Buscar mi reserva": se exigen los
 * dos datos, así nadie puede encontrar reservas ajenas probando códigos.
 */
export async function existeReserva(codigo: string, email: string): Promise<boolean> {
  const reserva = await db.reserva.findUnique({ where: { codigo }, select: { huespedEmail: true } });
  return Boolean(reserva && reserva.huespedEmail.trim().toLowerCase() === email.trim().toLowerCase());
}

/** Reserva para la página de confirmación. No expone email, teléfono ni RUT. */
export async function obtenerReservaPublica(codigo: string) {
  const reserva = await db.reserva.findUnique({
    where: { codigo },
    select: {
      codigo: true,
      checkIn: true,
      checkOut: true,
      adultos: true,
      ninos: true,
      huespedNombre: true,
      huespedEmail: true,
      total: true,
      abono: true,
      estado: true,
      expiraEn: true,
      aprobadaEn: true,
      esPrueba: true,
      pagos: { select: { estado: true } },
      cabana: {
        select: {
          nombre: true,
          slug: true,
          fotos: true,
          demo: true,
          propiedad: {
            select: {
              id: true,
              nombre: true,
              slug: true,
              ubicacion: true,
              urlMapa: true,
              whatsapp: true,
              politicaCancelacion: true,
              instruccionesLlegada: true,
              tema: true,
            },
          },
        },
      },
    },
  });
  if (!reserva) return null;

  // El link de pago no sale de aquí: el huésped paga con un botón (pagarAbono) que redirige a él.
  const { huespedNombre, huespedEmail, checkIn, checkOut, esPrueba, pagos, aprobadaEn, ...resto } = reserva;
  // Solo nombre e inicial del apellido: el código es fácil de adivinar.
  const [nombre, apellido] = huespedNombre.split(/\s+/);
  return {
    ...resto,
    checkIn: aFechaIso(checkIn),
    checkOut: aFechaIso(checkOut),
    huesped: apellido ? `${nombre} ${apellido[0]}.` : nombre,
    emailOculto: ocultarEmail(huespedEmail),
    prueba: esPrueba,
    pagoEnProceso: pagos.some((p) => p.estado === "pendiente"),
    aprobada: aprobadaEn !== null,
    vencida: plazoVencido(reserva, new Date()),
  };
}
