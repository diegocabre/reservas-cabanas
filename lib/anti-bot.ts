// Anti-bot sin dependencias: campo señuelo (los bots llenan todo) y marca de tiempo firmada (un
// humano no completa el formulario en 2 segundos ni lo reusa días después). verificarAntiBot es el
// único punto de entrada: más adelante se puede sumar Cloudflare Turnstile aquí sin tocar las acciones.

import { createHmac, timingSafeEqual } from "node:crypto";
import { CAMPO_MARCA, CAMPO_SENUELO } from "@/lib/anti-bot-campos";
import { secretoLimites } from "@/lib/limites";

export { CAMPO_MARCA, CAMPO_SENUELO };

/** Mínimo entre mostrar y enviar el formulario. */
export const SEGUNDOS_MINIMOS = 3;
/** Máximo: una pestaña abierta un día entero todavía sirve. */
export const HORAS_MAXIMAS = 24;

const firma = (ms: string, secreto: string) => createHmac("sha256", secreto).update(`marca:${ms}`).digest("base64url");

/** Marca para el formulario: "<ms>.<firma>". */
export function firmarMarca(ahora = new Date(), secreto = secretoLimites()): string {
  const ms = String(ahora.getTime());
  return `${ms}.${firma(ms, secreto)}`;
}

export type ResultadoAntiBot = { ok: true } | { ok: false; motivo: "senuelo" | "sin_marca" | "marca_invalida" | "muy_rapido" | "marca_vencida" };

/**
 * Revisa el envío de un formulario público. `exigirMarca` solo en formularios de páginas dinámicas
 * (la marca de una página estática quedaría fija desde el build).
 */
export function verificarAntiBot(
  form: Pick<FormData, "get">,
  opciones: { exigirMarca: boolean; ahora?: Date; secreto?: string },
): ResultadoAntiBot {
  const senuelo = form.get(CAMPO_SENUELO);
  if (typeof senuelo === "string" && senuelo.trim() !== "") return { ok: false, motivo: "senuelo" };
  if (!opciones.exigirMarca) return { ok: true };

  const marca = form.get(CAMPO_MARCA);
  if (typeof marca !== "string" || !marca) return { ok: false, motivo: "sin_marca" };
  const [ms, recibida] = marca.split(".");
  if (!ms || !recibida || !/^\d+$/.test(ms)) return { ok: false, motivo: "marca_invalida" };
  const esperada = Buffer.from(firma(ms, opciones.secreto ?? secretoLimites()));
  const dada = Buffer.from(recibida);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return { ok: false, motivo: "marca_invalida" };

  const transcurrido = (opciones.ahora ?? new Date()).getTime() - Number(ms);
  if (transcurrido < SEGUNDOS_MINIMOS * 1000) return { ok: false, motivo: "muy_rapido" };
  if (transcurrido > HORAS_MAXIMAS * 3_600_000) return { ok: false, motivo: "marca_vencida" };
  return { ok: true };
}

/** Mensaje al huésped si no pasa: no dice por qué (no ayuda al bot), y sirve si la pestaña era vieja. */
export const MENSAJE_ANTIBOT = "No pudimos enviar el formulario. Recarga la página e intenta de nuevo.";
