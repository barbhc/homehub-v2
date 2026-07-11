import "./e2e/load-env" // MUST be first: populates process.env from .env.test (local)
import { defineConfig, devices } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "./e2e/seed-config"

/**
 * Point the suite at a deployed preview by setting PLAYWRIGHT_BASE_URL
 * (e.g. the Vercel preview URL). When unset, Playwright boots the local dev
 * server and tests against it.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173"
const usingExternal = !!process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: "./e2e",
  // Legacy specs (e2e/legacy/) target the pre-redesign UI and are superseded by
  // the visual/a11y/flows suites. Excluded from the gate; see e2e/legacy/README.
  testIgnore: ["**/legacy/**"],
  // Run serially with one worker: parallel workers overwhelm the dev/preview
  // server + Supabase, which briefly stalls the home-context fetch and trips
  // HomeGate's `!home` redirect → pages flakily bounce to Home. Serial is
  // reliable (and matches CI). Per-test timeout is generous to cover data loads.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",
  // Keep desktop + mobile baselines separate, organised by spec file.
  snapshotPathTemplate: "e2e/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: {
    // Visual-regression tolerance: small enough to catch real layout/colour
    // drift, loose enough to ignore sub-pixel font rendering between machines.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  projects: [
    // Phase 1 boot smoke — no auth, no seed, no emulators. The only project CI
    // runs until the emulator seed lands (Phase 2/3) and the full suites return
    // (auth.setup then signs into the Auth EMULATOR instead of Supabase).
    {
      name: "smoke",
      testMatch: /smoke\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testIgnore: ["**/smoke/**"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: DESKTOP_VIEWPORT,
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testIgnore: ["**/smoke/**"],
      use: {
        ...devices["iPhone 14"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: usingExternal
    ? undefined
    : {
        // CI serves the built artifact (deterministic) via `vite preview`;
        // locally we use the dev server for fast iteration. Build first in CI.
        command: process.env.CI
          ? "npm run preview -- --port 5173 --strictPort"
          : "npm run dev",
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
