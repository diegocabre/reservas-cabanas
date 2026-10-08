/**
 * Versión de una foto para compartir (Open Graph / WhatsApp): 1200×630, JPG.
 * Para Unsplash se recorta con sus parámetros de imgix; otras URLs (y las rutas locales de
 * public/, que Next completa con metadataBase) se devuelven tal cual.
 */
export function fotoParaCompartir(url: string): string {
  if (!/^https?:\/\//.test(url)) return url;
  const u = new URL(url);
  if (u.hostname !== "images.unsplash.com") return url;
  u.search = "";
  u.searchParams.set("w", "1200");
  u.searchParams.set("h", "630");
  u.searchParams.set("fit", "crop");
  u.searchParams.set("q", "80");
  u.searchParams.set("fm", "jpg");
  return u.toString();
}

/** Imagen Open Graph: 1200×630 cuando se pudo recortar; si no, sin medidas (WhatsApp usa las del archivo). */
export function imagenParaCompartir(url: string, alt: string) {
  const compartir = fotoParaCompartir(url);
  return compartir === url ? { url, alt } : { url: compartir, width: 1200, height: 630, alt };
}
