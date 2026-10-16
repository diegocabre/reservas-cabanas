// Límites de intentos en rutas públicas: que un script no llene de reservas falsas las fechas de una
// cabaña ni use el sistema para enviar correos a terceros, sin molestar a un huésped real.
// Las claves (IP, email, teléfono) se guardan como HMAC con sal, nunca en claro (Ley 21.719).
// Detalle y umbrales: docs/endurecimiento.md.

import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

type Env = Record<string, string | undefined>;

/** Número entero positivo de una variable de entorno, o el valor por defecto. */
function entero(env: Env, nombre: string, porDefecto: number): number {
  const n = Number(env[nombre]);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

/** Umbrales, ajustables por variable de entorno sin tocar código. */
export function limites(env: Env = process.env) {
  return {
    /** Reservas pendientes (sin pagar o sin aprobar) por email y por teléfono en una misma cabaña. */
    pendientesPorContacto: entero(env, "LIMITE_PENDIENTES_POR_CONTACTO", 2),
    /** Reservas web por IP por hora. */
    reservasPorIpHora: entero(env, "LIMITE_RESERVAS_IP_HORA", 10),
    /** Correos a una misma dirección por día desde acciones públicas. */
    correosPorDestinoDia: entero(env, "LIMITE_CORREOS_DESTINO_DIA", 3),
    /** Noches máximas de una reserva web. */
    maxNoches: entero(env, "RESERVAS_MAX_NOCHES", 30),
    /** Intentos por IP por hora en búsquedas y formularios con token (mi reserva, reseñas, mis datos). */
    consultasPorIpHora: entero(env, "LIMITE_CONSULTAS_IP_HORA", 30),
    /** Búsquedas fallidas por código de reserva por hora (/mi-reserva). */
    busquedasPorCodigoHora: entero(env, "LIMITE_BUSQUEDAS_CODIGO_HORA", 10),
    /** Páginas de reserva no encontradas por IP por hora (/reserva/[codigo]). */
    noEncontradasPorIpHora: entero(env, "LIMITE_NO_ENCONTRADAS_IP_HORA", 20),
    /** Pedidos de link (panel, mis datos) por IP por hora. */
    linksPorIpHora: entero(env, "LIMITE_LINKS_IP_HORA", 10),
  };
}

/** Mensaje al superar un límite: amable y sin decir cuál. */
export const MENSAJE_LIMITE = "Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentar.";

let avisoSinSecreto = false;

/**
 * Secreto para las claves y la marca anti-bot: LIMITES_SECRETO. Si falta, se deriva de otro secreto
 * del servidor que ya existe, para no romper producción mientras se configura (con un aviso en el log).
 */
export function secretoLimites(env: Env = process.env): string {
  if (env.LIMITES_SECRETO) return env.LIMITES_SECRETO;
  if (!avisoSinSecreto) {
    avisoSinSecreto = true;
    console.warn(JSON.stringify({ evento: "limites_sin_secreto", detalle: "Falta LIMITES_SECRETO; se usa un secreto derivado" }));
  }
  const base = env.MERCADOPAGO_CLAVE_CIFRADO ?? env.CRON_SECRET ?? env.DATABASE_URL ?? "sin-secreto";
  return createHmac("sha256", base).update("limites-publicos").digest("base64url");
}

/** Clave guardada en la base: HMAC con sal del tipo y el valor normalizado. No se puede revertir sin el secreto. */
export function claveHash(tipo: "ip" | "email" | "telefono" | "codigo" | "token", valor: string, secreto = secretoLimites()): string {
  return createHmac("sha256", secreto).update(`${tipo}:${valor.trim().toLowerCase()}`).digest("base64url");
}

/**
 * IP del visitante. En Vercel, `x-vercel-forwarded-for` la pone el propio Vercel (no la puede falsear
 * el cliente); `x-forwarded-for` (primer valor) es el respaldo, y en local no hay ninguna.
 */
export function ipDeLaSolicitud(h: Pick<Headers, "get">): string {
  for (const nombre of ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"]) {
    const ip = h.get(nombre)?.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return "desconocida";
}

/** Acciones que se cuentan. */
export type AccionLimitada =
  | "reservar"
  | "buscar_reserva_ip"
  | "buscar_reserva_codigo"
  | "reserva_no_encontrada"
  | "pagar_abono"
  | "verificar_pago"
  | "resena"
  | "mis_datos"
  | "pedir_link"
  | "correo";

/**
 * Si la base falla (o la tabla todavía no existe porque el código se desplegó antes que la migración),
 * el límite deja pasar: un huésped real nunca queda bloqueado por un problema nuestro.
 */
function fallaAbierta(e: unknown, accion: AccionLimitada) {
  console.error(JSON.stringify({ evento: "limites_error", accion, detalle: e instanceof Error ? e.message.slice(0, 200) : "desconocido" }));
}

/** Cuántos intentos hubo en la ventana (0 si la base falla). */
async function contar(accion: AccionLimitada, clave: string, minutos: number, ahora: Date): Promise<number> {
  try {
    return await db.intentoPublico.count({ where: { accion, clave, creadoEn: { gt: new Date(ahora.getTime() - minutos * 60_000) } } });
  } catch (e) {
    fallaAbierta(e, accion);
    return 0;
  }
}

/** ¿Ya se superó el límite? Solo lee (para revisar antes de una acción que se cuenta solo si falla). */
export async function limiteSuperado(accion: AccionLimitada, clave: string, max: number, minutos: number, ahora = new Date()): Promise<boolean> {
  return (await contar(accion, clave, minutos, ahora)) >= max;
}

/** Anota un intento. */
export async function anotarIntento(accion: AccionLimitada, clave: string): Promise<void> {
  try {
    await db.intentoPublico.create({ data: { accion, clave } });
  } catch (e) {
    fallaAbierta(e, accion);
  }
}

/**
 * Consume un intento si queda cupo: true = permitido (y anotado), false = límite superado.
 * Límite blando: dos solicitudes simultáneas pueden pasar las dos; basta para frenar a un script.
 */
export async function consumirIntento(accion: AccionLimitada, clave: string, max: number, minutos: number, ahora = new Date()): Promise<boolean> {
  if (await limiteSuperado(accion, clave, max, minutos, ahora)) return false;
  await anotarIntento(accion, clave);
  return true;
}

/**
 * ¿Se puede enviar otro correo a esta dirección hoy (24 h)? Consume el cupo. Solo para correos que
 * dispara una acción pública (reserva apartada, solicitud recibida, link de acceso); los de un pago
 * aprobado o de una acción del dueño no se limitan.
 */
export async function cupoCorreo(email: string, ahora = new Date()): Promise<boolean> {
  const ok = await consumirIntento("correo", claveHash("email", email), limites().correosPorDestinoDia, 24 * 60, ahora);
  if (!ok) console.warn(JSON.stringify({ evento: "correo_sobre_tope", detalle: "No se envía: tope diario por destinatario" }));
  return ok;
}

/** Horas que se guardan los intentos (la ventana más larga es 24 h). */
export const HORAS_RETENCION_INTENTOS = 48;

/** Borra los intentos antiguos. Idempotente; lo llama el cron de expirar reservas. */
export async function limpiarIntentos(ahora = new Date()): Promise<number> {
  try {
    const { count } = await db.intentoPublico.deleteMany({
      where: { creadoEn: { lt: new Date(ahora.getTime() - HORAS_RETENCION_INTENTOS * 3_600_000) } },
    });
    return count;
  } catch (e) {
    // Sin la tabla (código desplegado antes que la migración) el cron sigue expirando reservas.
    console.error(JSON.stringify({ evento: "cron_limpieza_error", detalle: e instanceof Error ? e.message.slice(0, 200) : "desconocido" }));
    return 0;
  }
}
