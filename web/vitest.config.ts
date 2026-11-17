import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  test: { environment: "node", exclude: ["node_modules/**", ".next/**", ".next-*/**", "tests/integration/**"], coverage: { reporter: ["text", "json-summary"] } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
