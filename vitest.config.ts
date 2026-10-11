import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig.json: "@/lib/..." apunta a la raíz del proyecto.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // Los tests contra la base van aparte: npm run test:db (vitest.db.config.mts).
    exclude: [...configDefaults.exclude, "tests/db/**"],
  },
});
