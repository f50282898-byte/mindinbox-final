import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Unit tests (`npm test`) run in Node and cover pure logic: tiers, metering,
 * env validation, logging, ID-token verification, request guards.
 *
 * Firestore rules tests (`npm run test:rules`) live in `tests/` and are NOT
 * included here on purpose: they need the Firestore emulator and a running
 * Java runtime, so folding them into `npm test` would make the fast suite fail
 * on any machine without a JRE. They are a separate, explicit gate.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // Build gates live in scripts/ and have the same standing as unit tests: a
      // gate that cannot be executed in CI is not a gate. See scripts/lib/*.test.mjs.
      "scripts/**/*.test.mjs",
    ],
    exclude: ["node_modules", ".next", "e2e", "tests"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
