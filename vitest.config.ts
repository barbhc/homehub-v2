import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
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
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
