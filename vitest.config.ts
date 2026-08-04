import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@gamepass-indicator/core": resolve(
        __dirname,
        "packages/core/src/index.ts"
      ),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/catalog-builder/**/*.test.ts"],
  },
});
