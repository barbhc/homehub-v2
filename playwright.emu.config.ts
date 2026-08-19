import { defineConfig, devices } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "./e2e/seed-config"

/**
 * Emulator-backed e2e config. Runs the app in emulator mode (`npm run dev:emu`
 * → VITE_USE_EMULATORS=true) against a SEEDED Firestore/Auth emulator, so specs
 * exercise the real Firebase service layer end-to-end. Orchestrated by
 * `npm run test:e2e:emu` (starts emulators + seeds, then runs this).
 *
 * The `emu` project's testDir is scoped to e2e/emu — it grows one spec per
 * migrated module (auth + home now; items/tasks/… as they land). The legacy
 * flow/visual/a11y suites stay on the base config until the whole app is off
 * the shim.
 *
 * PW_CHROMIUM_PATH lets a sandbox point at a preinstalled Chromium; CI leaves it
 * unset and uses its own installed browsers.
 */
// Overridable, matching playwright.a11y/device/visual.config.ts. A hardcoded
// 5173 is worse than a port clash: Playwright attaches to whatever ALREADY
// answers there — a stale `vite preview` from days ago, say — and the suite
// silently tests the wrong build. Here that surfaced as auth.setup bouncing to
// /signin against a preview that predated the Firebase emulator wiring.
const PORT = Number(process.env.PW_WEB_PORT ?? 5173)
const chromiumPath = process.env.PW_CHROMIUM_PATH
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "emu",
      testMatch: /emu\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT, storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run dev:emu -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
