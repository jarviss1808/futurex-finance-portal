import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node", include: ["tests/integration/**/*.test.ts"], maxWorkers: 1, fileParallelism: false, testTimeout: 60000, hookTimeout: 60000 },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./tests/integration/server-only.ts", import.meta.url)) } },
});
