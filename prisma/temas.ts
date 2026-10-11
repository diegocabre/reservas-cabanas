// Temas visuales de las propiedades del seed (lib/tema.ts). Un test revisa que cada uno tenga
// contraste suficiente; el seed también lo revisa antes de guardarlo.

import type { Tema } from "../lib/tema";

/**
 * Maicolpue, San Juan de la Costa: costa del Pacífico y bosque valdiviano. Interfaz fría (bruma,
 * mar profundo, bosque); la calidez la ponen las fotos de la madera de la cabaña. Sin crema ni
 * terracota, y títulos sans en vez de la serif de la paleta base (ver PRODUCT.md).
 * Paleta de prueba, inventada para probar los temas por propiedad: falta que el dueño la apruebe.
 */
export const TEMA_MAICOLPUE: Tema = {
  titulos: "sans",
  colores: {
    papel: "#edf2f1", // bruma de la costa
    "papel-hondo": "#dbe5e3",
    nieve: "#fafcfc",
    tinta: "#12232a", // mar de noche
    "tinta-suave": "#475a61",
    madera: "#2e5a4f", // bosque: íconos y sombras
    "madera-clara": "#8fb2a7",
    lago: "#1a4c6b", // Pacífico profundo: enlaces y calendario
    musgo: "#2d6a4f", // helechos y musgo del bosque: WhatsApp
    volcan: "#29383e",
    fuego: "#0c6b75", // verde azulado del mar en Maicolpue: reservar y pagar
    "fuego-hondo": "#08525a",
    alerta: "#b3412b", // los errores siguen siendo rojizos
    "alerta-hondo": "#963522",
  },
};
