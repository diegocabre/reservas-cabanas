// Cifrado de secretos guardados en la base (tokens de Mercado Pago de cada propiedad).
// AES-256-GCM: confidencialidad e integridad (un valor alterado no se descifra).
// La clave vive solo en el entorno (MERCADOPAGO_CLAVE_CIFRADO, 32 bytes en base64): sin ella, una
// copia de la base no sirve para cobrar a nombre de los dueños.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function claveDeCifrado(env: Record<string, string | undefined> = process.env): Buffer {
  const base64 = env.MERCADOPAGO_CLAVE_CIFRADO;
  if (!base64) throw new Error("Falta MERCADOPAGO_CLAVE_CIFRADO en el entorno (32 bytes en base64)");
  const clave = Buffer.from(base64, "base64");
  if (clave.length !== 32) throw new Error("MERCADOPAGO_CLAVE_CIFRADO debe tener 32 bytes (base64 de 44 caracteres)");
  return clave;
}

/** "v1.<iv>.<tag>.<cifrado>" en base64url. */
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, iv);
  const cifrado = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return [VERSION, iv, cifrador.getAuthTag(), cifrado].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function descifrar(valor: string, clave: Buffer): string {
  const [version, iv, tag, cifrado] = valor.split(".");
  if (version !== VERSION || !iv || !tag || !cifrado) throw new Error("Valor cifrado con formato desconocido");
  const descifrador = createDecipheriv("aes-256-gcm", clave, Buffer.from(iv, "base64url"));
  descifrador.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([descifrador.update(Buffer.from(cifrado, "base64url")), descifrador.final()]).toString("utf8");
}
