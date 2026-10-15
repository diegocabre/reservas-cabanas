// Reglas puras de las reseñas (sin base de datos): elegibilidad, tokens, doble ciego, saneamiento
// de texto, promedios, JSON-LD e identidad del huésped. lib/resenas.ts las aplica con la base.

import { createHash, createHmac } from "node:crypto";
import { normalizarTelefono } from "@/lib/reserva-esquema";

const DIA_MS = 86_400_000;

/** Plazo para escribir cualquiera de las dos reseñas, desde el check-out. También vence el token. */
export const DIAS_PLAZO_RESENA = 30;
/** Doble ciego: pasado este plazo desde el check-out se publica lo que haya. */
export const DIAS_DOBLE_CIEGO = 14;
/** Recordatorio al huésped si no respondió. */
export const DIAS_RECORDATORIO = 7;
/** El dueño puede editar su respuesta pública durante estos días desde que la escribió. */
export const DIAS_EDITAR_RESPUESTA = 14;
/** Ediciones de una reseña retenida (límite contra abuso del link). */
export const MAXIMO_EDICIONES = 5;
export const LARGO_COMENTARIO = 1000;
export const LARGO_MINIMO_COMENTARIO = 10;
/** Vigencia del link de acceso del huésped a sus datos, y espera mínima entre dos pedidos. */
export const HORAS_LINK_ACCESO = 24;
export const MINUTOS_ENTRE_LINKS = 10;

// ---------------------------------------------------------------------------------------------
// Activación por propiedad (propiedad.resenas, la elige el superadmin en /admin/plataforma)
// ---------------------------------------------------------------------------------------------

/**
 * cabana: reseñas de la cabaña (invitaciones, formulario, respuestas, moderación).
 * completas: además las del huésped (privadas). El doble ciego corre en ambas.
 */
export type EtapaResenas = "apagadas" | "cabana" | "completas";

export const ETAPAS_RESENAS: Record<EtapaResenas, string> = {
  apagadas: "Apagadas",
  cabana: "De la cabaña (públicas)",
  completas: "De la cabaña y del huésped",
};

export const resenasCabanaActivas = (etapa: EtapaResenas | null | undefined) => etapa === "cabana" || etapa === "completas";
export const resenasHuespedActivas = (etapa: EtapaResenas | null | undefined) => etapa === "completas";

// ---------------------------------------------------------------------------------------------
// Fechas y elegibilidad
// ---------------------------------------------------------------------------------------------

export const sumarDiasIso = (iso: string, dias: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** Estados de una estadía que sí ocurrió (completada = confirmada y terminada). */
const ESTADOS_RESENABLES = ["confirmada", "completada"];

export type Elegibilidad = { ok: true } | { ok: false; motivo: string };

/**
 * ¿Se puede reseñar esta reserva hoy (en cualquiera de los dos sentidos)? Confirmada, check-out
 * ya llegado y dentro de los 30 días siguientes. Las cabañas demo no se reseñan.
 * "Una sola vez" lo asegura la base (único por reserva) y lib/resenas.ts.
 */
export function elegibilidad(r: { estado: string; checkOut: string; demo?: boolean }, hoy: string): Elegibilidad {
  if (r.demo) return { ok: false, motivo: "Las cabañas de demostración no reciben reseñas." };
  if (!ESTADOS_RESENABLES.includes(r.estado)) return { ok: false, motivo: "Solo se reseñan estadías confirmadas." };
  if (hoy < r.checkOut) return { ok: false, motivo: "La reseña se puede escribir después del check-out." };
  if (hoy > sumarDiasIso(r.checkOut, DIAS_PLAZO_RESENA)) {
    return { ok: false, motivo: `El plazo para reseñar terminó (${DIAS_PLAZO_RESENA} días desde el check-out).` };
  }
  return { ok: true };
}

/**
 * Vencimiento del token: fin del día 30 después del check-out en Chile. 04:00 UTC del día 31 es la
 * medianoche en invierno (UTC-4) y la 01:00 en verano (UTC-3): nunca vence antes de lo prometido.
 */
export function venceTokenResena(checkOut: string): Date {
  return new Date(`${sumarDiasIso(checkOut, DIAS_PLAZO_RESENA + 1)}T04:00:00Z`);
}

/** Doble ciego: ¿se publica ya? Con las dos reseñas escritas, o desde el día 14 después del check-out. */
export function debeDesbloquear(
  c: { checkOut: string; hayResenaCabana: boolean; hayResenaHuesped: boolean; desbloqueado: boolean },
  hoy: string,
): boolean {
  if (c.desbloqueado) return false;
  if (c.hayResenaCabana && c.hayResenaHuesped) return true;
  return hoy >= sumarDiasIso(c.checkOut, DIAS_DOBLE_CIEGO);
}

/**
 * ¿Toca la invitación por correo? Desde el día siguiente al check-out y solo la primera semana: al
 * activar las reseñas no les llega un correo a huéspedes que se fueron hace un mes (el dueño igual
 * puede pedirla por WhatsApp mientras dure el plazo).
 */
export const tocaInvitar = (checkOut: string, hoy: string) =>
  hoy >= sumarDiasIso(checkOut, 1) && hoy < sumarDiasIso(checkOut, DIAS_RECORDATORIO);

/** ¿Toca el recordatorio al huésped? Una vez, desde el día 7 después del check-out, si no respondió. */
export function tocaRecordatorio(
  c: { checkOut: string; invitacionEnviadaEn: Date | null; recordatorioEn: Date | null; respondio: boolean },
  hoy: string,
): boolean {
  if (c.respondio || !c.invitacionEnviadaEn || c.recordatorioEn) return false;
  return hoy >= sumarDiasIso(c.checkOut, DIAS_RECORDATORIO) && hoy <= sumarDiasIso(c.checkOut, DIAS_PLAZO_RESENA);
}

// ---------------------------------------------------------------------------------------------
// Tokens: HMAC(secreto, contexto:id:versión). Se guarda solo el hash (sha256); usarlo sube la
// versión, así el mismo link no sirve dos veces. Con el secreto el servidor puede volver a armar el
// link vigente (recordatorio, WhatsApp) sin guardarlo.
// ---------------------------------------------------------------------------------------------

export function secretoResenas(env: Record<string, string | undefined> = process.env): string {
  const s = env.RESENAS_SECRETO;
  if (!s || s.length < 32) throw new Error("Falta RESENAS_SECRETO en el entorno (texto aleatorio de 32+ caracteres)");
  return s;
}

export function firmarToken(secreto: string, contexto: "resena" | "acceso", id: string, version: number): string {
  return createHmac("sha256", secreto).update(`${contexto}:${id}:${version}`).digest("base64url");
}

/** Forma válida de un token (43 caracteres base64url): todo lo demás se rechaza sin ir a la base. */
export const formaDeToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/** Hash que se guarda y se busca por índice único (no hay comparación en memoria que filtrar por tiempo). */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------------------------------------------------------------------------------------------
// Texto: saneamiento (nunca se renderiza HTML; esto además evita guardar etiquetas o basura)
// ---------------------------------------------------------------------------------------------

/**
 * Quita etiquetas HTML, caracteres de control y espacios de más; acota el largo. React escapa al
 * mostrar, así que esto no es la única defensa contra XSS, pero evita guardar marcado.
 */
export function limpiarTexto(texto: unknown, maximo: number): string {
  if (typeof texto !== "string") return "";
  return texto
    .normalize("NFC")
    .replace(/<\/?[a-zA-Z!][^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximo);
}

/** Nombre de pila para mostrar en público ("Ana María Pérez" → "Ana"). Nunca el apellido. */
export function nombrePublico(nombreCompleto: string): string {
  const pila = limpiarTexto(nombreCompleto, 120).split(/\s+/)[0] ?? "";
  if (!pila) return "Huésped";
  return pila.charAt(0).toLocaleUpperCase("es-CL") + pila.slice(1, 40).toLocaleLowerCase("es-CL");
}

// ---------------------------------------------------------------------------------------------
// Identidad del huésped
// ---------------------------------------------------------------------------------------------

/** Email normalizado: sin espacios y en minúsculas. */
export const normalizarEmail = (email: string) => email.replace(/\s+/g, "").toLowerCase();

/** Teléfono normalizado (+569XXXXXXXX los chilenos) o null si no parece teléfono. */
export const normalizarTelefonoHuesped = (telefono: string | null | undefined) => (telefono ? normalizarTelefono(telefono) : null);

// ---------------------------------------------------------------------------------------------
// Reseñas de la cabaña: categorías, promedios y JSON-LD
// ---------------------------------------------------------------------------------------------

export const CATEGORIAS = [
  { clave: "limpieza", nombre: "Limpieza" },
  { clave: "ubicacion", nombre: "Ubicación" },
  { clave: "comunicacion", nombre: "Comunicación" },
  { clave: "veracidad", nombre: "Fiel a la publicación" },
  { clave: "calidadPrecio", nombre: "Calidad-precio" },
] as const;

export type ClaveCategoria = (typeof CATEGORIAS)[number]["clave"];
export type Notas = Record<ClaveCategoria, number>;

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/** Calificación general de una reseña: promedio de las 5 categorías, con un decimal. */
export const notaGeneral = (n: Notas) => redondear1(CATEGORIAS.reduce((s, c) => s + n[c.clave], 0) / CATEGORIAS.length);

export interface ResumenResenas {
  cantidad: number;
  promedio: number; // promedio de las notas generales, un decimal
  porCategoria: Record<ClaveCategoria, number>;
}

/** Resumen de las reseñas publicadas de una cabaña, o null si no hay ninguna. */
export function resumirResenas(resenas: Notas[]): ResumenResenas | null {
  if (resenas.length === 0) return null;
  const promedioDe = (f: (n: Notas) => number) => redondear1(resenas.reduce((s, r) => s + f(r), 0) / resenas.length);
  return {
    cantidad: resenas.length,
    // Promedio de los promedios sin redondear cada uno antes: más exacto.
    promedio: promedioDe((n) => CATEGORIAS.reduce((s, c) => s + n[c.clave], 0) / CATEGORIAS.length),
    porCategoria: Object.fromEntries(CATEGORIAS.map((c) => [c.clave, promedioDe((n) => n[c.clave])])) as Record<ClaveCategoria, number>,
  };
}

/** "2026-10-15T..." → "octubre de 2026" (las reseñas públicas muestran solo mes y año). */
export function mesYAnio(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", month: "long", year: "numeric" }).format(fecha);
}

export interface ResenaPublica extends Notas {
  id: string;
  nombre: string;
  comentario: string;
  publicadaEn: Date;
  respuesta: string | null;
}

/**
 * JSON-LD de schema.org para la página de la cabaña: VacationRental con AggregateRating y las
 * reseñas. null si no hay reseñas publicadas (nunca se inventa ni se muestra un 0).
 */
export function jsonLdCabana(
  cabana: { nombre: string; url: string; imagen: string | null; descripcion: string; ubicacion: string | null },
  resenas: ResenaPublica[],
  maximoResenas = 10,
) {
  const resumen = resumirResenas(resenas);
  if (!resumen) return null;
  return {
    "@context": "https://schema.org",
    "@type": "VacationRental",
    name: cabana.nombre,
    url: cabana.url,
    ...(cabana.imagen ? { image: cabana.imagen } : {}),
    ...(cabana.descripcion ? { description: cabana.descripcion.slice(0, 300) } : {}),
    ...(cabana.ubicacion ? { address: { "@type": "PostalAddress", addressLocality: cabana.ubicacion, addressCountry: "CL" } } : {}),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: resumen.promedio,
      reviewCount: resumen.cantidad,
      bestRating: 5,
      worstRating: 1,
    },
    review: resenas.slice(0, maximoResenas).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.nombre },
      datePublished: r.publicadaEn.toISOString().slice(0, 10),
      reviewBody: r.comentario,
      reviewRating: { "@type": "Rating", ratingValue: notaGeneral(r), bestRating: 5, worstRating: 1 },
    })),
  };
}

/** JSON dentro de <script>: escapa "<" para que un comentario no pueda cerrar la etiqueta. */
export const jsonParaScript = (datos: unknown) => JSON.stringify(datos).replace(/</g, "\\u003c");

/** Motivos con que el dueño reporta una reseña (mismos valores que el enum motivo_reporte). */
export const MOTIVOS_REPORTE = {
  insultos: "Insultos o lenguaje ofensivo",
  datos_personales: "Contiene datos personales",
  no_corresponde: "No corresponde a esta estadía",
} as const;

export type MotivoReporte = keyof typeof MOTIVOS_REPORTE;

// ---------------------------------------------------------------------------------------------
// Reseñas del huésped (privadas)
// ---------------------------------------------------------------------------------------------

export const CALIFICACIONES = {
  recomendado: "Recomendado",
  con_reservas: "Con reservas",
  no_recomendado: "No recomendado",
} as const;

export type Calificacion = keyof typeof CALIFICACIONES;

/** Etiquetas rápidas. Las claves son las mismas del check de la base. */
export const ETIQUETAS = {
  respetuoso: "Respetuoso",
  dejo_limpio: "Dejó todo limpio",
  cumplio_normas: "Cumplió las normas",
  cumplio_horarios: "Cumplió horarios",
  comunicacion_fluida: "Comunicación fluida",
  ruidoso: "Ruidoso",
  danos: "Daños",
} as const;

export type Etiqueta = keyof typeof ETIQUETAS;

export const esEtiqueta = (e: string): e is Etiqueta => Object.hasOwn(ETIQUETAS, e);

/** "3 estadías: 2 recomendado, 1 con reservas" y las 3 etiquetas más frecuentes. */
export function resumenHistorial(estadias: number, resenas: { calificacion: Calificacion; etiquetas: string[] }[]) {
  const conteo = (Object.keys(CALIFICACIONES) as Calificacion[])
    .map((c) => ({ c, n: resenas.filter((r) => r.calificacion === c).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${CALIFICACIONES[x.c].toLowerCase()}`);
  const frecuencia = new Map<string, number>();
  for (const e of resenas.flatMap((r) => r.etiquetas)) if (esEtiqueta(e)) frecuencia.set(e, (frecuencia.get(e) ?? 0) + 1);
  const etiquetas = [...frecuencia.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([e]) => ETIQUETAS[e as Etiqueta]);
  const titulo = `${estadias} ${estadias === 1 ? "estadía" : "estadías"}`;
  return {
    texto: conteo.length ? `${titulo}: ${conteo.join(", ")}` : `${titulo}, sin reseñas`,
    etiquetas,
  };
}

/** Mensaje de WhatsApp del dueño para pedir la reseña: lleva el MISMO link del correo. */
export function mensajePedirResena(r: { nombre: string; cabana: string; url: string }) {
  const [pila] = r.nombre.trim().split(/\s+/);
  return (
    `Hola ${pila}, te escribo de ${r.cabana}. ¡Gracias por quedarte con nosotros! ` +
    `Si tienes un minuto, nos ayudaría mucho tu reseña: ${r.url}`
  );
}
