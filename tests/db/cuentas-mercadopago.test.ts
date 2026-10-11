// Cuentas de Mercado Pago por propiedad contra la base real: los tokens no son legibles por el rol
// del panel, solo el dueño conecta o desconecta, cada dueño ve solo lo suyo y el token se descifra
// bien para cobrar. No llama a Mercado Pago. npm run test:db.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cifrar } from "@/lib/cifrado";
import { db } from "@/lib/db";
import { conectarCuenta, desconectarCuenta, estadoCuentas, tokenDePropiedad, tokenDeVendedor } from "@/lib/mercadopago-cuentas";
import { cargarAdmin, comoAdmin, type AdminSesion } from "@/lib/panel-acceso";

const sufijo = randomUUID().slice(0, 8);
const clave = randomBytes(32);
let propiedadA: string;
let propiedadB: string;
let duenoA: AdminSesion;
let staffA: AdminSesion;
let duenoB: AdminSesion;
const vendedorA = `9${Date.now()}`;

async function crearPropiedad(letra: string) {
  return (
    await db.propiedad.create({
      data: {
        nombre: `Test MP ${letra} ${sufijo}`,
        slug: `test-mp-${letra.toLowerCase()}-${sufijo}`,
        prefijoCodigo: `M${letra}${sufijo}`.toUpperCase(),
        whatsapp: "+56900000000",
        email: "test@example.com",
      },
    })
  ).id;
}

beforeAll(async () => {
  process.env.MERCADOPAGO_CLAVE_CIFRADO = clave.toString("base64");
  propiedadA = await crearPropiedad("A");
  propiedadB = await crearPropiedad("B");
  const [ua, us, ub] = [randomUUID(), randomUUID(), randomUUID()];
  await db.admin.createMany({
    data: [
      { usuarioId: ua, propiedadId: propiedadA, email: `dueno-a-${sufijo}@example.com`, rol: "dueno" },
      { usuarioId: us, propiedadId: propiedadA, email: `staff-a-${sufijo}@example.com`, rol: "staff" },
      { usuarioId: ub, propiedadId: propiedadB, email: `dueno-b-${sufijo}@example.com`, rol: "dueno" },
    ],
  });
  [duenoA, staffA, duenoB] = await Promise.all([ua, us, ub].map(async (u) => (await cargarAdmin(u))!));

  // Cuenta conectada de A (como la dejaría conectarCuenta), vigente por 100 días.
  await db.cuentaMercadoPago.create({
    data: {
      propiedadId: propiedadA,
      mpUserId: vendedorA,
      accessTokenCifrado: cifrar("APP_USR-token-de-a", clave),
      refreshTokenCifrado: cifrar("TG-refresh-de-a", clave),
      expiraEn: new Date(Date.now() + 100 * 86_400_000),
      produccion: true,
      conectadaPor: duenoA.email,
    },
  });
});

afterAll(async () => {
  const ids = [propiedadA, propiedadB].filter(Boolean);
  await db.auditoria.deleteMany({ where: { propiedadId: { in: ids } } });
  await db.cuentaMercadoPago.deleteMany({ where: { propiedadId: { in: ids } } });
  await db.admin.deleteMany({ where: { propiedadId: { in: ids } } });
  await db.propiedad.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("tabla cuenta_mercadopago", () => {
  it("el rol del panel no puede leerla ni escribirla, ni siquiera el dueño", async () => {
    await expect(comoAdmin(duenoA, (tx) => tx.cuentaMercadoPago.findMany())).rejects.toThrow();
    await expect(
      comoAdmin(duenoA, (tx) => tx.cuentaMercadoPago.updateMany({ where: { propiedadId: propiedadA }, data: { mpUserId: "otro" } })),
    ).rejects.toThrow();
  });

  it("guarda los tokens cifrados, nunca en texto plano", async () => {
    const fila = await db.cuentaMercadoPago.findUniqueOrThrow({ where: { propiedadId: propiedadA } });
    expect(fila.accessTokenCifrado).not.toContain("APP_USR");
    expect(fila.refreshTokenCifrado).not.toContain("TG-");
  });
});

describe("tokens para cobrar", () => {
  it("entrega el token descifrado de la propiedad y del vendedor del aviso", async () => {
    expect(await tokenDePropiedad(propiedadA)).toBe("APP_USR-token-de-a");
    expect(await tokenDeVendedor(vendedorA)).toBe("APP_USR-token-de-a");
  });

  it("una propiedad sin cuenta no tiene token", async () => {
    expect(await tokenDePropiedad(propiedadB)).toBeNull();
    expect(await tokenDeVendedor("123")).toBeNull();
  });
});

describe("estado y permisos", () => {
  it("cada dueño ve solo el estado de sus propiedades, sin tokens", async () => {
    const deA = await estadoCuentas(duenoA);
    expect(deA.get(propiedadA)).toMatchObject({ mpUserId: vendedorA, conectadaPor: duenoA.email });
    expect(JSON.stringify([...deA.values()])).not.toContain("Cifrado");
    expect((await estadoCuentas(duenoB)).has(propiedadA)).toBe(false);
  });

  it("el personal (staff) y el dueño de otra propiedad no pueden conectar ni desconectar", async () => {
    const error = { ok: false, error: "Solo el dueño de la propiedad puede conectar su Mercado Pago." };
    expect(await conectarCuenta(staffA, propiedadA, "code")).toEqual(error);
    expect(await conectarCuenta(duenoB, propiedadA, "code")).toEqual(error);
    expect((await desconectarCuenta(staffA, propiedadA)).ok).toBe(false);
    expect((await desconectarCuenta(duenoB, propiedadA)).ok).toBe(false);
    expect(await db.cuentaMercadoPago.count({ where: { propiedadId: propiedadA } })).toBe(1);
  });

  it("el dueño desconecta, queda en la auditoría y la propiedad deja de tener token", async () => {
    expect(await desconectarCuenta(duenoA, propiedadA)).toEqual({ ok: true });
    expect(await tokenDePropiedad(propiedadA)).toBeNull();
    const [registro] = await db.auditoria.findMany({ where: { propiedadId: propiedadA } });
    expect(registro).toMatchObject({ accion: "desconectar_mercadopago", email: duenoA.email, detalle: `Cuenta de Mercado Pago ${vendedorA}` });
    // El dueño de A ve esa auditoría desde el panel; el de B no.
    expect(await comoAdmin(duenoA, (tx) => tx.auditoria.count({ where: { propiedadId: propiedadA } }))).toBe(1);
    expect(await comoAdmin(duenoB, (tx) => tx.auditoria.count({ where: { propiedadId: propiedadA } }))).toBe(0);
  });
});
