import { test, expect, gotoStable } from "../fixtures"
import type { Page } from "@playwright/test"

/**
 * Full-page visual snapshots of every redesign surface, captured at both the
 * desktop (1440px → DesktopHome et al.) and mobile (iPhone 14) viewports via
 * the `chromium` and `mobile` projects. Baselines live under
 * `e2e/__screenshots__/<project>/…` and are the regression gate.
 *
 * Each page waits on a piece of SEEDED content (proof the data layer resolved)
 * before snapshotting, so we never race an empty skeleton.
 *
 * First run / intentional change:  npm run test:e2e:update
 */

type PageCase = {
  name: string
  path: string
  /** Seeded text that only appears once the page's data has loaded. */
  ready: RegExp
}

const PAGES: PageCase[] = [
  { name: "home", path: "/home", ready: /good (morning|afternoon|evening)|today|this week/i },
  { name: "tasks", path: "/maintenance", ready: /Replace HVAC furnace filter/i },
  { name: "items", path: "/inventory", ready: /Bosch 800 Series Dishwasher/i },
  { name: "ask", path: "/chat", ready: /ask|help|question/i },
  { name: "warranties", path: "/warranties", ready: /Bosch|Carrier|coverage/i },
  { name: "clean", path: "/clean", ready: /start cleaning|cleaning guides|this week/i },
  { name: "providers", path: "/providers", ready: /Ace Heating & Air/i },
  { name: "settings", path: "/settings", ready: /settings|appearance|account/i },
]

/**
 * Wait until the page is visually settled so full-page snapshots are
 * deterministic. The flaky failures were height drift: `fullPage` captures the
 * whole scroll height, and a slow async section (member list, warranty
 * computations, item cards) sometimes hadn't painted at snapshot time, so the
 * image dimensions differed run-to-run. We poll document height until it stops
 * changing across consecutive reads — directly killing the height race — before
 * letting fonts settle. (We deliberately do NOT wait for networkidle: the app
 * holds a live Supabase realtime socket, so it never goes idle and the wait just
 * burns the timeout on every test.)
 */
async function freeze(page: Page): Promise<void> {
  // Poll scrollHeight until it's stable for two consecutive reads (layout settled).
  let last = -1
  let stable = 0
  for (let i = 0; i < 30 && stable < 2; i++) {
    const h = await page.evaluate(() => document.body.scrollHeight)
    stable = h === last ? stable + 1 : 0
    last = h
    await page.waitForTimeout(150)
  }
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(300)
}

async function settle(page: Page, ready: RegExp): Promise<void> {
  // The redesign renders desktop AND mobile variants in the DOM (toggled by
  // `hidden`/`lg:` classes), so `.first()` can resolve to the hidden one.
  // Filter to visible matches before waiting.
  await page.getByText(ready).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 20_000 })
  await freeze(page)
}

for (const p of PAGES) {
  test(`${p.name} page matches snapshot`, async ({ page }) => {
    await gotoStable(page, p.path)
    await settle(page, p.ready)
    await expect(page).toHaveScreenshot(`${p.name}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 })
  })
}

test("item detail page matches snapshot", async ({ page }) => {
  await gotoStable(page, "/inventory")
  // Exact match so the item CARD is clicked, not a "Clean the <item>" guide
  // link (which navigates to /clean).
  const card = page.getByText("Bosch 800 Series Dishwasher", { exact: true }).filter({ visible: true }).first()
  await card.waitFor({ timeout: 20_000 })
  await card.click()
  await expect(page).toHaveURL(/\/(items|inventory)\/[0-9a-f-]+/i, { timeout: 15_000 })
  await page.getByRole("heading", { name: /Bosch 800 Series Dishwasher/i }).first().waitFor({ timeout: 15_000 })
  await freeze(page)
  await expect(page).toHaveScreenshot("item-detail.png", { fullPage: true, maxDiffPixelRatio: 0.01 })
})
