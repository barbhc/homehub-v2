import { defineConfig } from "vitest/config"

/**
 * Dedicated config for the Firestore security-rules tests. Separate from
 * vitest.config.ts because these run in NODE (not jsdom), need no React setup,
 * and require a live Firestore emulator (run via `npm run test:rules:emu`).
 * Kept out of the default `npm test` so a green unit run never depends on the
 * emulator JAR being present.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["firebase/rules.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
