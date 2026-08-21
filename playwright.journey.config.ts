import { defineConfig, devices } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "./e2e/seed-config"

/**
 * Journey-walk config: the chained happy-path walks in e2e/journey/, against
 * the SEEDED emulator (same web server as the emu config). One worker, one
 * file — the /journey-smoke screenshot manifest depends on stable ordering.
 *
 * Run:  npm run test:e2e:journey:emu
 * Out:  $JOURNEY_OUT (default journey-report/latest) — PNG per step + manifest.json
 *
 * PW_WEB_PORT: run on a different port when 5173 is already taken by a dev
 * server you don't want the suite driving (a prod-preview on 5173 must never
 * be a test target).
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {}
const PORT = Number(process.env.PW_WEB_PORT ?? 5173)

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // Journeys are long chains by design — a dozen asserted steps each with its
  // own wait budget. 90s proved too tight for J1 on a cold dev server.
  timeout: 180_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    {
      name: "journey",
      testMatch: /journey\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT },
    },
  ],
  webServer: {
    command: `npm run dev:emu -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
