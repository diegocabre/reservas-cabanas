import { describe, expect, it } from "vitest";
import {
  debeDesbloquear,
  elegibilidad,
  etapaResenas,
  firmarToken,
  formaDeToken,
  hashToken,
  jsonLdCabana,
  jsonParaScript,
  limpiarTexto,
  mensajePedirResena,
  mesYAnio,
  nombrePublico,
  normalizarEmail,
  normalizarTelefonoHuesped,
  notaGeneral,
  resumenHistorial,
  resumirResenas,
  tocaInvitar,
  tocaRecordatorio,
  venceTokenResena,
  type ResenaPublica,
} from "./resenas-reglas";

describe("etapaResenas", () => {
  it("apagadas por defecto y con valores desconocidos", () => {
    expect(etapaResenas({})).toBe("apagadas");
    expect(etapaResenas({ RESENAS: "si" })).toBe("apagadas");
    expect(etapaResenas({ RESENAS: " Cabana " })).toBe("cabana");
    expect(etapaResenas({ RESENAS: "completas" })).toBe("completas");
  });
});

describe("elegibilidad", () => {
  const r = { estado: "confirmada", checkOut: "2026-10-10" };
  it("solo confirmadas (o completadas) con check-out llegado", () => {
    expect(elegibilidad(r, "2026-10-10").ok).toBe(true);
    expect(elegibilidad({ ...r, estado: "completada" }, "2026-10-11").ok).toBe(true);
    for (const estado of ["pendiente_pago", "cancelada", "pendiente_aprobacion", "aprobada_pendiente_pago", "rechazada", "expirada"]) {
      expect(elegibilidad({ ...r, estado }, "2026-10-11").ok).toBe(false);
    }
    expect(elegibilidad(r, "2026-10-09").ok).toBe(false);
  });
  it("plazo de 30 días desde el check-out", () => {
    expect(elegibilidad(r, "2026-11-09").ok).toBe(true);
    const fuera = elegibilidad(r, "2026-11-10");
    expect(fuera.ok).toBe(false);
    if (!fuera.ok) expect(fuera.motivo).toMatch(/30 días/);
  });
  it("las cabañas demo no se reseñan", () => {
    expect(elegibilidad({ ...r, demo: true }, "2026-10-11").ok).toBe(false);
  });
  it("el token vence al terminar el día 30 en Chile, nunca antes", () => {
    const vence = venceTokenResena("2026-10-10");
    expect(vence.toISOString()).toBe("2026-11-10T04:00:00.000Z");
    // 9 nov 23:59 en Chile (verano, UTC-3) = 10 nov 02:59 UTC: sigue vigente.
    expect(new Date("2026-11-10T02:59:00Z") < vence).toBe(true);
  });
});

describe("invitación y recordatorio", () => {
  it("invita desde el día siguiente al check-out, solo la primera semana", () => {
    expect(tocaInvitar("2026-10-10", "2026-10-10")).toBe(false);
    expect(tocaInvitar("2026-10-10", "2026-10-11")).toBe(true);
    expect(tocaInvitar("2026-10-10", "2026-10-16")).toBe(true);
    expect(tocaInvitar("2026-10-10", "2026-10-17")).toBe(false);
  });
  it("recuerda una vez desde el día 7 si no respondió", () => {
    const base = { checkOut: "2026-10-10", invitacionEnviadaEn: new Date(), recordatorioEn: null, respondio: false };
    expect(tocaRecordatorio(base, "2026-10-16")).toBe(false);
    expect(tocaRecordatorio(base, "2026-10-17")).toBe(true);
    expect(tocaRecordatorio({ ...base, respondio: true }, "2026-10-17")).toBe(false);
    expect(tocaRecordatorio({ ...base, recordatorioEn: new Date() }, "2026-10-17")).toBe(false);
    expect(tocaRecordatorio({ ...base, invitacionEnviadaEn: null }, "2026-10-17")).toBe(false);
  });
});

describe("doble ciego", () => {
  const c = { checkOut: "2026-10-10", hayResenaCabana: false, hayResenaHuesped: false, desbloqueado: false };
  it("se desbloquea con las dos reseñas", () => {
    expect(debeDesbloquear({ ...c, hayResenaCabana: true }, "2026-10-11")).toBe(false);
    expect(debeDesbloquear({ ...c, hayResenaHuesped: true }, "2026-10-11")).toBe(false);
    expect(debeDesbloquear({ ...c, hayResenaCabana: true, hayResenaHuesped: true }, "2026-10-11")).toBe(true);
  });
  it("o a los 14 días del check-out, aunque falte una", () => {
    expect(debeDesbloquear({ ...c, hayResenaCabana: true }, "2026-10-23")).toBe(false);
    expect(debeDesbloquear({ ...c, hayResenaCabana: true }, "2026-10-24")).toBe(true);
  });
  it("una vez desbloqueado no se vuelve a desbloquear", () => {
    expect(debeDesbloquear({ ...c, desbloqueado: true, hayResenaCabana: true, hayResenaHuesped: true }, "2026-10-24")).toBe(false);
  });
});

describe("tokens", () => {
  const secreto = "x".repeat(40);
  it("cambian con la versión, el id, el contexto y el secreto", () => {
    const t = firmarToken(secreto, "resena", "abc", 0);
    expect(formaDeToken(t)).toBe(true);
    expect(firmarToken(secreto, "resena", "abc", 1)).not.toBe(t);
    expect(firmarToken(secreto, "resena", "abd", 0)).not.toBe(t);
    expect(firmarToken(secreto, "acceso", "abc", 0)).not.toBe(t);
    expect(firmarToken("y".repeat(40), "resena", "abc", 0)).not.toBe(t);
  });
  it("se guardan por hash y rechazan formas inválidas", () => {
    const t = firmarToken(secreto, "resena", "abc", 0);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(`${t.slice(0, -1)}A`)).not.toBe(hashToken(t));
    expect(formaDeToken(`${t}x`)).toBe(false);
    expect(formaDeToken("../../etc/passwd")).toBe(false);
    expect(formaDeToken("")).toBe(false);
  });
});

describe("limpiarTexto", () => {
  it("quita HTML, control y espacios de más, y acota el largo", () => {
    expect(limpiarTexto('<script>alert("x")</script>Muy <b>linda</b>', 100)).toBe('alert("x")Muy linda');
    expect(limpiarTexto("<img src=x onerror=alert(1)>Hola", 100)).toBe("Hola");
    expect(limpiarTexto("a < b > c", 100)).toBe("a b c");
    expect(limpiarTexto("Hola\u0000‮  mundo\r\n\r\n\r\n\r\nchao", 100)).toBe("Hola mundo\n\nchao");
    expect(limpiarTexto("x".repeat(50), 10)).toHaveLength(10);
    expect(limpiarTexto(42, 10)).toBe("");
  });
});

describe("nombrePublico", () => {
  it("solo el nombre de pila, nunca el apellido", () => {
    expect(nombrePublico("ana maría PÉREZ soto")).toBe("Ana");
    expect(nombrePublico("  ")).toBe("Huésped");
    expect(nombrePublico("<b>Juan</b> Pérez")).toBe("Juan");
  });
});

describe("normalización del huésped", () => {
  it("email sin espacios y en minúsculas", () => {
    expect(normalizarEmail("  Ana.Perez @Gmail.COM ")).toBe("ana.perez@gmail.com");
  });
  it("teléfono chileno a +569XXXXXXXX", () => {
    expect(normalizarTelefonoHuesped("9 1234 5678")).toBe("+56912345678");
    expect(normalizarTelefonoHuesped("+56 9 1234 5678")).toBe("+56912345678");
    expect(normalizarTelefonoHuesped("569-1234-5678")).toBe("+56912345678");
    expect(normalizarTelefonoHuesped("123")).toBeNull();
    expect(normalizarTelefonoHuesped(null)).toBeNull();
  });
});

const resena = (n: number, extra: Partial<ResenaPublica> = {}): ResenaPublica => ({
  id: String(n),
  nombre: "Ana",
  comentario: "Todo muy lindo",
  publicadaEn: new Date("2026-10-20T15:00:00Z"),
  respuesta: null,
  limpieza: n,
  ubicacion: n,
  comunicacion: n,
  veracidad: n,
  calidadPrecio: n,
  ...extra,
});

describe("promedios", () => {
  it("nota general = promedio de las categorías, un decimal", () => {
    expect(notaGeneral({ limpieza: 5, ubicacion: 4, comunicacion: 5, veracidad: 4, calidadPrecio: 4 })).toBe(4.4);
  });
  it("resumen sin reseñas es null; con reseñas, promedio y desglose", () => {
    expect(resumirResenas([])).toBeNull();
    const r = resumirResenas([resena(5), resena(4), { ...resena(4), limpieza: 3 }]);
    expect(r?.cantidad).toBe(3);
    expect(r?.porCategoria.limpieza).toBe(4);
    expect(r?.porCategoria.ubicacion).toBe(4.3);
    // (5 + 4 + 3.8) / 3 = 4.266…
    expect(r?.promedio).toBe(4.3);
  });
  it("mes y año en español de Chile", () => {
    expect(mesYAnio(new Date("2026-10-20T15:00:00Z"))).toBe("octubre de 2026");
  });
});

describe("jsonLdCabana", () => {
  const cabana = { nombre: "Cabaña del Lago", url: "https://x.cl/p/c", imagen: null, descripcion: "", ubicacion: "Maicolpue" };
  it("null sin reseñas publicadas: nunca un 0", () => {
    expect(jsonLdCabana(cabana, [])).toBeNull();
  });
  it("promedio, conteo y reseñas reales", () => {
    const ld = jsonLdCabana(cabana, [resena(5), resena(4)]) as Record<string, any>;
    expect(ld["@type"]).toBe("VacationRental");
    expect(ld.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 });
    expect(ld.review).toHaveLength(2);
    expect(ld.review[0]).toMatchObject({ author: { name: "Ana" }, datePublished: "2026-10-20", reviewRating: { ratingValue: 5 } });
    expect(ld.address).toMatchObject({ addressLocality: "Maicolpue", addressCountry: "CL" });
  });
  it("el conteo es el total aunque el detalle se limite", () => {
    const ld = jsonLdCabana(cabana, Array.from({ length: 12 }, () => resena(5)), 10) as Record<string, any>;
    expect(ld.aggregateRating.reviewCount).toBe(12);
    expect(ld.review).toHaveLength(10);
  });
  it("un comentario no puede cerrar el <script>", () => {
    const ld = jsonLdCabana(cabana, [resena(5, { comentario: "</script><script>alert(1)</script>" })]);
    expect(jsonParaScript(ld)).not.toContain("</script>");
  });
});

describe("resumenHistorial", () => {
  it("cuenta estadías y calificaciones, con las etiquetas más frecuentes", () => {
    const h = resumenHistorial(3, [
      { calificacion: "recomendado", etiquetas: ["respetuoso", "dejo_limpio"] },
      { calificacion: "recomendado", etiquetas: ["respetuoso"] },
      { calificacion: "con_reservas", etiquetas: ["ruidoso", "inventada"] },
    ]);
    expect(h.texto).toBe("3 estadías: 2 recomendado, 1 con reservas");
    expect(h.etiquetas[0]).toBe("Respetuoso");
    expect(h.etiquetas).not.toContain("inventada");
  });
  it("sin reseñas", () => {
    expect(resumenHistorial(1, []).texto).toBe("1 estadía, sin reseñas");
  });
});

describe("mensajePedirResena", () => {
  it("lleva el link del correo y el nombre de pila", () => {
    expect(mensajePedirResena({ nombre: "Ana Pérez", cabana: "Cabaña Ñuble", url: "https://x.cl/resena/abc" })).toBe(
      "Hola Ana, te escribo de Cabaña Ñuble. ¡Gracias por quedarte con nosotros! Si tienes un minuto, nos ayudaría mucho tu reseña: https://x.cl/resena/abc",
    );
  });
});
