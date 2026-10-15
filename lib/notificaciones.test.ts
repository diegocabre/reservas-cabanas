import { describe, expect, it, vi } from "vitest";

// lib/notificaciones usa esEmailEnviable de lib/emails, que importa la base de datos.
vi.mock("@/lib/db", () => ({ db: {} }));

const { contenidoDueno, contenidoHuesped, notificarHuesped } = await import("./notificaciones");
type Datos = Parameters<typeof contenidoHuesped>[1];

const datos: Datos = {
  codigo: "MA-7K3QX9",
  prueba: false,
  propiedad: "Maicolpue",
  emailPropiedad: "dueno@gmail.com",
  cabana: "Cabaña del Mar",
  huespedNombre: "Ana Pérez",
  huespedEmail: "ana@gmail.com",
  huespedTelefono: "+56912345678",
  mensaje: "Somos una familia de 4",
  llegada: "20 de diciembre de 2026",
  salida: "23 de diciembre de 2026",
  noches: 3,
  personas: 4,
  total: "$180.000",
  abono: "$90.000",
  limite: "16 de octubre de 2026 a las 15:30",
  linkPago: "https://mp.example/pagar",
  motivo: null,
  urlReserva: "https://sitio/reserva/MA-7K3QX9",
  urlReservar: "https://sitio/reservar/maicolpue/cabana",
  urlPanel: "https://sitio/admin/reservas/MA-7K3QX9",
};

describe("contenido de los avisos", () => {
  it("aprobada: saludo con el nombre, botón «Pagar y confirmar mi reserva» con el link y la hora límite", () => {
    const c = contenidoHuesped("solicitud_aprobada", datos);
    expect(c.titulo).toContain("Ana");
    expect(c.boton).toEqual({ texto: "Pagar y confirmar mi reserva", url: "https://mp.example/pagar" });
    expect(c.parrafos.join(" ")).toContain("16 de octubre de 2026 a las 15:30");
    expect(c.parrafos.join(" ")).toContain("$90.000");
  });

  it("rechazo: incluye el motivo solo si el dueño lo escribió", () => {
    expect(contenidoHuesped("solicitud_rechazada", datos).parrafos.join(" ")).not.toContain("Su mensaje");
    expect(contenidoHuesped("solicitud_rechazada", { ...datos, motivo: "Ya tenía esas fechas" }).parrafos.join(" ")).toContain(
      "«Ya tenía esas fechas»",
    );
  });

  it("recibida: avisa que no se cobra hasta aprobar", () => {
    expect(contenidoHuesped("solicitud_recibida", datos).parrafos.join(" ")).toContain("No se te cobra nada");
  });

  it("dueño: nueva solicitud con mensaje, teléfono y link directo al panel", () => {
    const c = contenidoDueno("nueva_solicitud", datos);
    const texto = c.texto.join("\n");
    expect(texto).toContain("«Somos una familia de 4»");
    expect(texto).toContain("+56912345678");
    expect(texto).toContain("https://sitio/admin/reservas/MA-7K3QX9");
  });

  it("modo prueba: el asunto lo indica", () => {
    expect(contenidoHuesped("solicitud_recibida", { ...datos, prueba: true }).asunto).toMatch(/^\[Prueba\]/);
  });
});

describe("notificarHuesped", () => {
  it("sin RESEND_API_KEY devuelve el error (para mostrarlo en el panel) y no lanza", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await notificarHuesped("email", "solicitud_recibida", datos)).toEqual({ ok: false, error: "RESEND_API_KEY no configurada" });
    vi.unstubAllEnvs();
  });
});
