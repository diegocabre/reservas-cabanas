import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// En tiempo de ejecución usamos DATABASE_URL (pooler de Supabase).
// Las migraciones usan DIRECT_URL (ver prisma.config.ts).
function crearCliente() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL en el entorno");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Singleton: evita abrir un cliente nuevo en cada hot reload de desarrollo.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalParaPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = db;
}
