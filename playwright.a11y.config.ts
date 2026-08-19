import { defineConfig, devices } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "./e2e/seed-config"

/**
 * Accessibility config, emulator-backed.
 *
 * This file exists because e2e/a11y/a11y.spec.ts was UNREACHABLE. It only
 * matched the base playwright.config.ts, whose `chromium`/`mobile` projects
 * predate the Firebase migration and expect a Supabase-era session — so the
 * only suite in the repo that could catch an accessibility regression had not
 * run in any pipeline for weeks. It was also self-disabled
 * (`A11Y_BLOCKING = false`), which meant that even when someone did run it by
 * hand, it reported and passed.
 *
 * Two problems, one of which hides the other: a suite that cannot run looks the
 * same as a suite that passes.
 *
 * Runs at both viewports against the SEEDED emulator, same web server as the
 * visual config.
 *
 * Run: npm run test:e2e:a11y:emu
 */
// Overridable so this suite can run beside another vite server. Same reason as
// the emulator ports: a hardcoded 5173 means only one suite can exist at a time.
const PORT = Number(process.env.PW_WEB_PORT ?? 5173)

/**
 * Anchored to the e2e directory, NOT a bare /a11y\/.../ — Playwright matches
 * testMatch against the ABSOLUTE path, so an unanchored pattern also matches
 * every spec in the repo whenever the checkout directory happens to contain the
 * word (a worktree named `homehub-v2-a11y` does). The symptom is the a11y run
 * quietly executing the entire e2e suite and failing on something unrelated,
 * which reads as "accessibility is broken".
 */
const A11Y_SPECS = /[\\/]e2e[\\/]a11y[\\/].*\.spec\.ts$/
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
      name: "chromium",
      testMatch: A11Y_SPECS,
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT, storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      // Mobile is not a nice-to-have here: tap-target size, the failure that
      // cost v1 five fix commits in 48 hours, is only measurable at a touch
      // viewport. A desktop-only a11y run would have missed every one of them.
      name: "mobile",
      testMatch: A11Y_SPECS,
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
