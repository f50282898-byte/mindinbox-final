import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Firestore + Storage rules tests.
 *
 * Separate from `vitest.config.ts` because these require the emulators, which
 * require a Java runtime. `npm run test:rules` boots them via
 * `firebase emulators:exec` and points the SDKs at the local ports.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    // The emulator is slow to warm; serial is faster and keeps output readable.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
