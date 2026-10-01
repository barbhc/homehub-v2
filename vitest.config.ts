import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Every unit test runs on the users' clock: Pacific. Vitest hands `env` to
    // each worker process at spawn, so TZ is set before any module (or Date)
    // loads — on CI's UTC runners and on every laptop alike. In UTC the local
    // and UTC calendar dates never differ, so a "which day is today" bug
    // (shared/dates/calendar.ts) could not fail here; west of UTC it can, from
    // ~5 pm. Tests that need another zone pin it themselves (vi.stubEnv("TZ")).
    env: { TZ: "America/Los_Angeles" },
    // Unit tests under src/, plus the firebase-free modules in shared/ that
    // the functions import (spend-cap policy). e2e/*.spec.ts are Playwright
    // specs (run via `npm run test:e2e`) and must not be collected by vitest.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "shared/**/*.{test,spec}.ts",
      // The parse eval's SCORER. It decides whether a parse regression ships,
      // so it is gated like product code — a broken scorer produces a green
      // eval that measures nothing, which is worse than no eval. Only the pure
      // scoring module is collected; the runner needs credentials and an API.
      "evals/**/*.{test,spec}.ts",
      // Pure halves of the ops scripts. A data repair decides which production
      // rows it rewrites, so its rule is gated like product code; the CLI that
      // reads and writes is proven against the emulator, not here.
      "scripts/**/*.{test,spec}.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
