import { defineConfig, devices } from "@playwright/test"
import { DESKTOP_VIEWPORT, WEB_PORT } from "./e2e/seed-config"

/**
 * Journey-walk config: the chained happy-path walks in e2e/journey/, against
 * the SEEDED emulator (same web server as the emu config). One worker, one
 * file — the /journey-smoke screenshot manifest depends on stable ordering.
 *
 * Run:  npm run test:e2e:journey:emu
 * Out:  $JOURNEY_OUT (default journey-report/latest) — PNG per step + manifest.json
 *
 * The web port and the no-reuse rule live in e2e/seed-config (WEB_PORT): these
 * walks SIGN UP, so a suite that adopted a production-configured server would
 * not just read the wrong data, it would create real accounts. It has.
 * PW_WEB_PORT overrides the port to run two suites side by side.
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {}
const PORT = WEB_PORT

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
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
