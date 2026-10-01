import { describe, expect, it } from "vitest";
import { fotoParaCompartir } from "./fotos";
import { urlDelSitio } from "./sitio";

describe("urlDelSitio", () => {
  it("prefiere NEXT_PUBLIC_SITE_URL", () => {
    const url = urlDelSitio({ NEXT_PUBLIC_SITE_URL: "https://reservas.example.cl", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" });
    expect(url.origin).toBe("https://reservas.example.cl");
  });

  it("usa el dominio de producción de Vercel si no hay URL propia", () => {
    expect(urlDelSitio({ VERCEL_PROJECT_PRODUCTION_URL: "reservas-cabanas.vercel.app" }).origin).toBe(
      "https://reservas-cabanas.vercel.app",
    );
  });

  it("cae a localhost en desarrollo", () => {
    expect(urlDelSitio({}).origin).toBe("http://localhost:3000");
  });
});

describe("fotoParaCompartir", () => {
  it("recorta las fotos de Unsplash a 1200×630 en JPG", () => {
    const url = fotoParaCompartir("https://images.unsplash.com/photo-123-abc?w=1600&q=80&auto=format&fit=crop");
    expect(url).toBe("https://images.unsplash.com/photo-123-abc?w=1200&h=630&fit=crop&q=80&fm=jpg");
  });

  it("deja intactas las fotos de otros hosts", () => {
    expect(fotoParaCompartir("https://cdn.example.com/a.jpg?x=1")).toBe("https://cdn.example.com/a.jpg?x=1");
  });
});
