// Galerías con fotos y videos (verticales, grabados con el celular) que vienen en una carpeta de
// public/ con su galeria.json. Las cabañas sin galería usan sus `fotos` como siempre.
//
// El ítem 1 es la portada: abre la galería y su imagen (foto o poster del video) es la vista
// previa en WhatsApp (og:image) y la foto del email de confirmación (vía cabana.fotos[0]).

import galeriaMaicolpue from "@/public/piloto/cabana-maicolpue/galeria/galeria.json";

export interface MedioGaleria {
  tipo: "foto" | "video";
  src: string;
  /** Imagen fija: la foto misma, o el poster del video. */
  imagen: string;
  alt: string;
}

interface ItemJson {
  orden: number;
  tipo: string;
  archivo: string;
  poster?: string;
  alt: string;
}

export interface GaleriaJson {
  cabana: string;
  items: ItemJson[];
}

/** Galerías en public/, por "propiedad/cabaña". */
const GALERIAS: Record<string, { carpeta: string; json: GaleriaJson }> = {
  "maicolpue/maicolpue": { carpeta: "/piloto/cabana-maicolpue/galeria", json: galeriaMaicolpue },
};

/** Convierte un galeria.json en medios ordenados, con rutas públicas. Falla si un video no trae poster. */
export function leerGaleria(json: GaleriaJson, carpeta: string): MedioGaleria[] {
  return [...json.items]
    .sort((a, b) => a.orden - b.orden)
    .map((item): MedioGaleria => {
      const src = `${carpeta}/${item.archivo}`;
      if (item.tipo === "foto") return { tipo: "foto", src, imagen: src, alt: item.alt };
      if (item.tipo !== "video") throw new Error(`Galería ${json.cabana}: tipo desconocido "${item.tipo}" en ${item.archivo}`);
      if (!item.poster) throw new Error(`Galería ${json.cabana}: el video ${item.archivo} no tiene poster`);
      return { tipo: "video", src, imagen: `${carpeta}/${item.poster}`, alt: item.alt };
    });
}

/** Imágenes fijas de la galería en orden (fotos y posters): lo que se guarda en cabana.fotos. */
export function fotosDeGaleria(medios: MedioGaleria[]): string[] {
  return medios.map((m) => m.imagen);
}

/** Galería de una cabaña: la de su carpeta si tiene, o sus fotos con un texto alternativo genérico. */
export function galeriaDeCabana(c: { propiedadSlug: string; slug: string; nombre: string; fotos: string[] }): MedioGaleria[] {
  const propia = GALERIAS[`${c.propiedadSlug}/${c.slug}`];
  if (propia) return leerGaleria(propia.json, propia.carpeta);
  return c.fotos.map((foto, i) => ({ tipo: "foto", src: foto, imagen: foto, alt: `${c.nombre}, foto ${i + 1} de ${c.fotos.length}` }));
}

/** Galería registrada para el seed (null si la cabaña no tiene carpeta propia). */
export function galeriaRegistrada(propiedadSlug: string, slug: string): MedioGaleria[] | null {
  const propia = GALERIAS[`${propiedadSlug}/${slug}`];
  return propia ? leerGaleria(propia.json, propia.carpeta) : null;
}
