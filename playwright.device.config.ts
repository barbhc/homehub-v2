import { defineConfig, devices } from "@playwright/test"
import { WEB_PORT } from "./e2e/seed-config"

/**
 * Device-matrix config, emulator-backed.
 *
 * Viewports live in the SPEC, not here, because each one is asserted against
 * differently (tap targets only apply where there is a thumb). One project,
 * one browser, four sizes.
 *
 * Anchored testMatch: Playwright matches against the ABSOLUTE path, so a bare
 * /device\/.../ also matches every spec whenever the checkout directory
 * contains the word — a worktree named `homehub-v2-devices` does exactly that,
 * and the symptom is this suite silently running the entire e2e suite.
 */
const PORT = WEB_PORT
const DEVICE_SPECS = /[\\/]e2e[\\/]device[\\/].*\.spec\.ts$/
const chromiumPath = process.env.PW_CHROMIUM_PATH
const launchOptions = chromiumPath
  ? { executablePath: chromiumPath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] }
  : {}

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
      name: "devices",
      testMatch: DEVICE_SPECS,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
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
