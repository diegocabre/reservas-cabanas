import { describe, expect, it } from "vitest";
import { fotosDeGaleria, galeriaDeCabana, leerGaleria, type GaleriaJson } from "./galeria";

describe("leerGaleria", () => {
  const json: GaleriaJson = {
    cabana: "prueba",
    items: [
      { orden: 2, tipo: "foto", archivo: "02.jpg", alt: "Dormitorio" },
      { orden: 1, tipo: "video", archivo: "01.mp4", poster: "01-poster.jpg", alt: "Sala" },
    ],
  };

  it("ordena por `orden` y arma rutas públicas; el video usa su poster como imagen", () => {
    expect(leerGaleria(json, "/piloto/x")).toEqual([
      { tipo: "video", src: "/piloto/x/01.mp4", imagen: "/piloto/x/01-poster.jpg", alt: "Sala" },
      { tipo: "foto", src: "/piloto/x/02.jpg", imagen: "/piloto/x/02.jpg", alt: "Dormitorio" },
    ]);
  });

  it("falla si un video no trae poster", () => {
    expect(() => leerGaleria({ cabana: "x", items: [{ orden: 1, tipo: "video", archivo: "a.mp4", alt: "a" }] }, "/x")).toThrow(
      "no tiene poster",
    );
  });
});

describe("galeriaDeCabana", () => {
  it("Maicolpue: el ítem 1 (video de la sala comedor) es la portada y su poster la vista previa", () => {
    const medios = galeriaDeCabana({ propiedadSlug: "maicolpue", slug: "maicolpue", nombre: "Cabaña Maicolpue", fotos: [] });
    expect(medios).toHaveLength(7);
    expect(medios[0]).toMatchObject({
      tipo: "video",
      src: "/piloto/cabana-maicolpue/galeria/01-sala-comedor.mp4",
      imagen: "/piloto/cabana-maicolpue/galeria/01-sala-comedor-poster.jpg",
    });
    expect(fotosDeGaleria(medios)[0]).toBe("/piloto/cabana-maicolpue/galeria/01-sala-comedor-poster.jpg");
    expect(medios.filter((m) => m.tipo === "video").every((m) => m.imagen.endsWith("-poster.jpg"))).toBe(true);
  });

  it("las cabañas sin carpeta de galería usan sus fotos", () => {
    const medios = galeriaDeCabana({ propiedadSlug: "lago-llanquihue", slug: "volcan-osorno", nombre: "Volcán", fotos: ["a.jpg", "b.jpg"] });
    expect(medios.map((m) => [m.tipo, m.src])).toEqual([
      ["foto", "a.jpg"],
      ["foto", "b.jpg"],
    ]);
  });
});
