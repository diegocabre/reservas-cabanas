import { afterEach, describe, expect, it, vi } from "vitest";
import { detalleError, registrar, sanear } from "./registro";

afterEach(() => vi.restoreAllMocks());

describe("sanear", () => {
  it("quita emails, teléfonos y tokens", () => {
    const texto = sanear('Invalid `prisma.reserva.create()`: huespedEmail: "ana.perez@gmail.com", telefono "+56 9 1234 5678", token APP_USR-123-abc-456, Bearer abc.def');
    expect(texto).not.toMatch(/ana\.perez|gmail|1234 5678|APP_USR-123|abc\.def/);
    expect(texto).toContain("[email]");
    expect(texto).toContain("[número]");
    expect(texto).toContain("[token]");
  });
  it("recorta textos largos", () => {
    expect(sanear("x".repeat(1_000))).toHaveLength(300);
  });
});

describe("registrar", () => {
  it("una línea JSON buscable por evento, con los errores reducidos a su mensaje saneado", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registrar("error", "pago_verificacion_fallida", { codigo: "LL-7K3QX9AB", detalle: new Error("falló para ana@correo.cl") });
    expect(JSON.parse(error.mock.calls[0][0] as string)).toEqual({
      evento: "pago_verificacion_fallida",
      codigo: "LL-7K3QX9AB",
      detalle: "falló para [email]",
    });
  });
  it("detalleError acepta errores, objetos con message y textos", () => {
    expect(detalleError(new Error("a"))).toBe("a");
    expect(detalleError({ message: "b", name: "x" })).toBe("b");
    expect(detalleError("c")).toBe("c");
  });
});
