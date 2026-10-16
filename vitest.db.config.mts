import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests contra la base de Supabase (DATABASE_URL de .env): RLS, permisos entre propiedades.
// Crean sus propios datos con prefijo "test-" y los borran al terminar.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    // Los tests anteriores al límite de pendientes reusan el mismo email y teléfono en muchas
    // reservas; tests/db/limites.test.ts lo prueba con el valor por defecto.
    env: { LIMITE_PENDIENTES_POR_CONTACTO: "1000" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Un solo archivo a la vez: comparten la base.
    fileParallelism: false,
  },
});
