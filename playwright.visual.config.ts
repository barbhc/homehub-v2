import { defineConfig, devices } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "./e2e/seed-config"

/**
 * Visual-regression config, emulator-backed. Runs e2e/visual/pages.spec.ts at the
 * desktop (`chromium`) and mobile (`mobile`) viewports against the SEEDED
 * Firestore/Auth emulator (same web server as the emu e2e config). Baselines live
 * under e2e/__screenshots__/<project>/… and were re-baked here post-fix-A (they
 * were byte-identical v1 copies before).
 *
 * Run:    npm run test:e2e:visual:emu
 * Rebake: npm run test:e2e:visual:update   (intentional UI change / first bake)
 *
 * PW_CHROMIUM_PATH points a sandbox at a preinstalled Chromium; CI leaves it unset.
 * NOTE: baselines are browser/OS-sensitive — CI must run the same pinned Playwright
 * Chromium on Linux, or re-bake in CI on first adoption.
 */
// Overridable so the visual suite can run beside another vite server; same
// reason as the emulator ports.
const PORT = Number(process.env.PW_WEB_PORT ?? 5173)
const chromiumPath = process.env.PW_CHROMIUM_PATH
// The sandbox runs as root; --no-sandbox is required there (CI leaves
// PW_CHROMIUM_PATH unset, so this stays empty and its own browsers are used).
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
  snapshotPathTemplate: "e2e/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium",
      testMatch: /visual\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT, storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /visual\/.*\.spec\.ts/,
      use: { ...devices["iPhone 14"], storageState: "e2e/.auth/user.json" },
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
