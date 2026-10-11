import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cifrar, claveDeCifrado, descifrar } from "@/lib/cifrado";

const clave = randomBytes(32);

describe("cifrar y descifrar", () => {
  it("recupera el texto original y no lo deja legible", () => {
    const token = "APP_USR-1234567890-abcdef";
    const cifrado = cifrar(token, clave);
    expect(cifrado).not.toContain("APP_USR");
    expect(cifrado.startsWith("v1.")).toBe(true);
    expect(descifrar(cifrado, clave)).toBe(token);
  });

  it("cada cifrado es distinto aunque el texto sea el mismo", () => {
    expect(cifrar("igual", clave)).not.toBe(cifrar("igual", clave));
  });

  it("falla con otra clave o si alguien altera el valor", () => {
    const cifrado = cifrar("secreto", clave);
    expect(() => descifrar(cifrado, randomBytes(32))).toThrow();
    const partes = cifrado.split(".");
    partes[3] = Buffer.from("otra-cosa").toString("base64url");
    expect(() => descifrar(partes.join("."), clave)).toThrow();
    expect(() => descifrar("texto plano", clave)).toThrow();
  });
});

describe("claveDeCifrado", () => {
  it("exige 32 bytes en base64", () => {
    expect(claveDeCifrado({ MERCADOPAGO_CLAVE_CIFRADO: clave.toString("base64") })).toEqual(clave);
    expect(() => claveDeCifrado({})).toThrow(/Falta/);
    expect(() => claveDeCifrado({ MERCADOPAGO_CLAVE_CIFRADO: randomBytes(16).toString("base64") })).toThrow(/32 bytes/);
  });
});
