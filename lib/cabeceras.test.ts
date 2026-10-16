import { describe, expect, it } from "vitest";
import { cabecerasDeSeguridad, CSP_PROPUESTA, RUTAS_PRIVADAS } from "./cabeceras";

const reglas = cabecerasDeSeguridad();
const valores = (source: string) => Object.fromEntries(reglas.find((r) => r.source === source)!.headers.map((h) => [h.key, h.value]));

describe("cabecerasDeSeguridad", () => {
  it("globales: nosniff, HSTS de 6 a 12 meses sin subdominios ni preload, referer recortado, permisos apagados", () => {
    const g = valores("/:path*");
    expect(g["X-Content-Type-Options"]).toBe("nosniff");
    const maxAge = Number(/max-age=(\d+)/.exec(g["Strict-Transport-Security"])![1]);
    expect(maxAge).toBeGreaterThanOrEqual(180 * 86_400);
    expect(maxAge).toBeLessThanOrEqual(366 * 86_400);
    expect(g["Strict-Transport-Security"]).not.toMatch(/includeSubDomains|preload/);
    expect(g["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(g["Permissions-Policy"]).toMatch(/camera=\(\)/);
    expect(g["Permissions-Policy"]).toMatch(/microphone=\(\)/);
    expect(g["Permissions-Policy"]).toMatch(/geolocation=\(\)/);
  });

  it("ninguna CSP que bloquee: la propuesta va solo en Report-Only", () => {
    for (const r of reglas) {
      const csp = r.headers.find((h) => h.key === "Content-Security-Policy")?.value;
      if (csp) expect(csp).toBe("frame-ancestors 'none'");
    }
    expect(valores("/:path*")["Content-Security-Policy-Report-Only"]).toBe(CSP_PROPUESTA);
  });

  it("panel y rutas con token: sin iframes, sin referer y sin caché", () => {
    expect(RUTAS_PRIVADAS).toEqual(expect.arrayContaining(["/admin/:path*", "/mis-datos/:path*", "/resena/:path*"]));
    for (const ruta of RUTAS_PRIVADAS) {
      expect(valores(ruta)).toEqual({
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
      });
    }
  });

  it("las páginas públicas de la cabaña y de reservar no prohíben iframes", () => {
    const privadas = RUTAS_PRIVADAS.map((r) => r.replace("/:path*", ""));
    for (const ruta of ["/maicolpue/maicolpue", "/reservar/maicolpue/maicolpue", "/", "/mi-reserva"]) {
      expect(privadas.some((p) => ruta === p || ruta.startsWith(`${p}/`))).toBe(false);
    }
  });
});
