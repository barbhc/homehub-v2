import { test } from "@playwright/test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { DESKTOP_VIEWPORT } from "../seed-config"

/**
 * Opt-in capture of the committed design prototype (`design/Homehub Desktop.html`)
 * as the visual REFERENCE the app is judged against ("prototype as baseline").
 *
 * This is NOT a hard pixel gate — a hand-built prototype and the real app never
 * pixel-match (fonts, real vs mock data). It produces a reference PNG to view
 * side-by-side with the app snapshots (and for the agent to compare against).
 *
 * The prototype self-bootstraps React/Babel (network-dependent), so this is
 * best-effort and excluded from the default run. Capture it explicitly:
 *
 *   CAPTURE_PROTOTYPE=1 npx playwright test e2e/prototype --project=chromium
 */
test.skip(!process.env.CAPTURE_PROTOTYPE, "set CAPTURE_PROTOTYPE=1 to capture the prototype reference")

test("capture desktop prototype reference", async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize(DESKTOP_VIEWPORT)

  const file = path.resolve(process.cwd(), "design/Homehub Desktop.html")
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" })

  // Wait for the bundler to mount something substantial, then settle.
  await page.waitForFunction(() => (document.body?.innerText?.length ?? 0) > 200, { timeout: 90_000 })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(1_500)

  await page.screenshot({
    path: "e2e/prototype-reference/desktop-prototype.png",
    fullPage: true,
  })
})
