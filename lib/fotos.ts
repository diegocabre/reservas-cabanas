/**
 * Versión de una foto para compartir (Open Graph / WhatsApp): 1200×630, JPG.
 * Para Unsplash se recorta con sus parámetros de imgix; otras URLs se devuelven tal cual.
 */
export function fotoParaCompartir(url: string): string {
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
