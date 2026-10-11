// Tema visual por propiedad: cada dueño tiene los colores que identifican a sus cabañas.
// Se guarda en propiedad.tema (JSON) y se aplica sobrescribiendo las variables de app/globals.css
// en un contenedor (<TemaPropiedad>). Funciones puras: validar, revisar contraste y armar el estilo.

import type { CSSProperties } from "react";
import { z } from "zod";

export const COLORES_TEMA = [
  "papel", // fondo de la página
  "papel-hondo", // chips, zonas secundarias
  "nieve", // tarjetas y superficies claras; texto sobre botones
  "tinta", // texto principal
  "tinta-suave", // texto secundario
  "madera", // detalles e íconos cálidos, sombras de tarjetas
  "madera-clara",
  "lago", // enlaces, selección del calendario, botones secundarios
  "musgo", // botón de WhatsApp, estados "pagado"
  "volcan",
  "fuego", // botón principal (reservar, pagar)
  "fuego-hondo", // botón principal al pasar el mouse
  "alerta", // errores y avisos
  "alerta-hondo",
] as const;

export type ColorTema = (typeof COLORES_TEMA)[number];
export type Colores = Record<ColorTema, string>;

/** Paleta base: los mismos valores de :root en app/globals.css (un test lo verifica). */
export const TEMA_BASE: Colores = {
  papel: "#f6f0e6",
  "papel-hondo": "#ebe0cd",
  nieve: "#fffdf9",
  tinta: "#2a2420",
  "tinta-suave": "#6a5d52",
  madera: "#8a5636",
  "madera-clara": "#c99a6b",
  lago: "#1d4a5a",
  musgo: "#56663a",
  volcan: "#3b3a37",
  fuego: "#c0522a",
  "fuego-hondo": "#a14320",
  alerta: "#c0522a",
  "alerta-hondo": "#a14320",
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "Color en formato #rrggbb" });

/** Tema guardado en la base: solo los colores que cambian, más el estilo de los títulos. */
export const esquemaTema = z
  .object({
    colores: z.partialRecord(z.enum(COLORES_TEMA), hex).default({}),
    /** "serif" (por defecto) o "sans": títulos con la misma fuente del texto. */
    titulos: z.enum(["serif", "sans"]).default("serif"),
  })
  .strict();

export type Tema = z.output<typeof esquemaTema>;

/** Lee el tema de la base. Un tema inválido se ignora (la página usa la paleta base), nunca rompe. */
export function leerTema(valor: unknown): Tema | null {
  if (valor === null || valor === undefined) return null;
  const r = esquemaTema.safeParse(valor);
  return r.success ? r.data : null;
}

/** Paleta completa: la base con los colores propios encima. */
export function coloresDe(tema: Tema | null): Colores {
  return { ...TEMA_BASE, ...(tema?.colores ?? {}) };
}

/** Variables CSS para el contenedor de la propiedad (solo las que cambian). */
export function estiloTema(tema: Tema | null): CSSProperties {
  if (!tema) return {};
  const estilo: Record<string, string> = {};
  for (const [nombre, valor] of Object.entries(tema.colores)) if (valor) estilo[`--${nombre}`] = valor;
  if (tema.titulos === "sans") estilo["--font-titulo"] = "var(--font-texto)";
  return estilo as CSSProperties;
}

// --- Contraste (WCAG 2.x) ---

function luminancia(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste entre dos colores #rrggbb (1 a 21). */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Pares de colores que la interfaz pone uno sobre otro, con el mínimo WCAG AA para texto (4,5:1).
 * [texto, fondo, dónde se usa].
 */
export const PARES_TEXTO: readonly [ColorTema, ColorTema, string][] = [
  ["tinta", "papel", "texto sobre el fondo"],
  ["tinta", "nieve", "texto en tarjetas"],
  ["tinta-suave", "papel", "texto secundario sobre el fondo"],
  ["tinta-suave", "nieve", "texto secundario en tarjetas"],
  ["tinta", "papel-hondo", "texto en chips"],
  ["nieve", "fuego", "botón principal"],
  ["nieve", "fuego-hondo", "botón principal (mouse encima)"],
  ["nieve", "lago", "botones y días elegidos del calendario"],
  ["lago", "nieve", "enlaces en tarjetas"],
  ["lago", "papel", "enlaces sobre el fondo"],
  ["nieve", "musgo", "botón de WhatsApp"],
  ["alerta-hondo", "nieve", "mensajes de error"],
  ["alerta-hondo", "papel", "errores de campos"],
];

/** Problemas de contraste del tema: lista vacía si toda combinación de texto se lee bien. */
export function problemasDeContraste(tema: Tema | null): string[] {
  const c = coloresDe(tema);
  return PARES_TEXTO.filter(([texto, fondo]) => contraste(c[texto], c[fondo]) < 4.5).map(
    ([texto, fondo, uso]) => `${uso}: ${texto} sobre ${fondo} tiene ${contraste(c[texto], c[fondo]).toFixed(2)}:1 (mínimo 4,5:1)`,
  );
}
