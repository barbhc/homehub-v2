import { defineConfig, devices } from "@playwright/test"
import { DESKTOP_VIEWPORT, WEB_PORT } from "./e2e/seed-config"

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
// Shared with playwright.a11y/device/visual/journey.config.ts — see WEB_PORT in
// e2e/seed-config for why it is not Vite's 5173 and why reuse is off. Attaching
// to whatever ALREADY answers on a port means silently testing the wrong build;
// here that surfaced as auth.setup bouncing to /signin against a preview that
// predated the Firebase emulator wiring.
const PORT = WEB_PORT
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
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
