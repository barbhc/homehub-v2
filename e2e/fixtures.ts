import { test as base, expect } from "@playwright/test"
import { SEED_TODAY } from "./seed-config"

/**
 * Deterministic test fixture.
 *
 * 1. Pins Date/now to SEED_TODAY (the same anchor the seed script used for
 *    due-dates) so "overdue / due soon / this week" math and relative
 *    timestamps render identically every run. We use `setFixedTime` (NOT
 *    `clock.install`) on purpose: install() freezes ALL timers, which hangs the
 *    app's data loading (SWR, effects, rAF); setFixedTime fixes the wall clock
 *    while leaving timers running.
 * 2. Kills CSS animations/transitions defensively (on top of Playwright's own
 *    `animations: "disabled"` during screenshots) so nothing is mid-flight.
 *
 * Time is fixed AFTER auth (storageState carries a real, fresh token), so
 * freezing the clock never invalidates the session.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date(`${SEED_TODAY}T10:00:00`))
    await page.addInitScript(() => {
      const css =
        "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}"
      const apply = () => {
        const style = document.createElement("style")
        style.setAttribute("data-e2e-no-motion", "")
        style.textContent = css
        document.documentElement.appendChild(style)
      }
      if (document.documentElement) apply()
      else document.addEventListener("DOMContentLoaded", apply)
    })
    await use(page)
  },
})

export { expect }

/**
 * Navigate to `path` and ensure the SPA actually settled there. In the test
 * env a fresh deep-link occasionally bounces (an effect client-navigates away
 * before the route paints), so re-navigate up to 3× until the pathname sticks.
 * Real, deterministic redirects still surface (the content wait fails after).
 */
export async function gotoStable(
  page: import("@playwright/test").Page,
  path: string
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path)
    const stuck = await page
      .waitForFunction((p) => window.location.pathname === p, path, { timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    if (stuck) return
  }
  await page.goto(path)
}
