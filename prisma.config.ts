import "dotenv/config";
import { defineConfig } from "prisma/config";

// La CLI de Prisma (migraciones, introspección) usa la conexión directa.
// La app en tiempo de ejecución usa DATABASE_URL (pooler) desde lib/db.ts.
// Se lee con process.env (no con env()) para que `prisma generate` funcione
// sin base de datos; las migraciones fallan con error claro si falta.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
