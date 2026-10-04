import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig.json: "@/lib/..." apunta a la raíz del proyecto.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
