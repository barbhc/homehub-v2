import { test, expect, gotoStable } from "../fixtures"
import type { Locator } from "@playwright/test"

/**
 * Behavioural guards for the rebuilt Tasks tab (mobile TasksV3A + desktop
 * DesktopTasksRoom). Pins the redesign's defining interactions so they can't
 * silently regress:
 *   · the dismissible "Start here" insight banner (desktop)
 *   · Group-by reshaping the list, Urgency → Room (desktop)
 *   · tap-to-expand row detail (mobile)
 *   · swipe-right = Mark done (mobile)
 *
 * The page renders desktop AND mobile variants in the DOM (toggled by
 * `hidden`/`lg:`), so `.first()` can resolve to the hidden one — target visible
 * matches via `vis()`.
 */

const vis = (loc: Locator) => loc.filter({ visible: true }).first()
const isMobile = (name: string) => name === "mobile"

test.describe("Tasks redesign — desktop", () => {
  test("the 'Start here' insight banner is dismissible", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Desktop layout (DesktopTasksRoom)")
    await gotoStable(page, "/maintenance")
    await expect(vis(page.getByText(/Replace HVAC furnace filter/i))).toBeVisible({ timeout: 20_000 })

    // Two essential tasks are seeded overdue → the calm "Start here" nudge shows.
    await expect(vis(page.getByText(/^Start here$/i))).toBeVisible()
    await vis(page.getByText(/essential task.*overdue/i)).waitFor()

    await vis(page.getByRole("button", { name: /dismiss/i })).click()
    // Banner gone — no VISIBLE "Start here" left (mobile's hidden copy doesn't count).
    await expect(page.getByText(/^Start here$/i).filter({ visible: true })).toHaveCount(0)
  })

  test("Group-by reshapes the list (Urgency → Room)", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Desktop layout (DesktopTasksRoom)")
    await gotoStable(page, "/maintenance")
    await expect(vis(page.getByText(/Replace HVAC furnace filter/i))).toBeVisible({ timeout: 20_000 })

    // Default lens = Urgency → a "Later" section exists (coils due >7 days out).
    await expect(vis(page.getByText(/^Later$/))).toBeVisible()

    // Switch to Room → room-named groups appear; urgency sections disappear.
    await vis(page.getByRole("button", { name: /^room$/i })).click()
    await expect(vis(page.getByText(/^Garage$/))).toBeVisible()
    await expect(page.getByText(/^Later$/).filter({ visible: true })).toHaveCount(0)
  })
})

test.describe("Tasks redesign — mobile", () => {
  test("tapping a row expands its detail", async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), "Mobile layout (TasksV3A)")
    await gotoStable(page, "/maintenance")
    const row = vis(page.getByText(/Replace HVAC furnace filter/i))
    await expect(row).toBeVisible({ timeout: 20_000 })

    await row.click()
    // Expanded detail always offers the full-guide link (real data has no
    // fabricated supplies/steps, so this is the stable expand signal).
    await expect(vis(page.getByRole("button", { name: /view full guide/i }))).toBeVisible()
  })

  test("swiping a row right marks it done", async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), "Mobile swipe gesture (TasksV3A)")
    await gotoStable(page, "/maintenance")

    // A recurring task regenerates its next instance on completion, so it's
    // present at the start of every seeded run; skip (don't fail) if a prior
    // unseeded run already cleared it.
    const title = "Wipe down kitchen surfaces"
    const row = page.getByText(title, { exact: true }).filter({ visible: true }).first()
    if (!(await row.isVisible({ timeout: 20_000 }).catch(() => false))) {
      test.skip(true, "seeded task absent (reseed to re-test)")
      return
    }

    const box = await row.boundingBox()
    if (!box) throw new Error("row has no bounding box")
    const y = box.y + box.height / 2
    // Press in the title area (right of the left-edge checkbox) and drag past
    // the 72px done threshold.
    const startX = box.x + box.width * 0.6
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(startX + 110, y, { steps: 12 })
    await page.mouse.up()

    await expect(page.getByText(title, { exact: true }).filter({ visible: true })).toHaveCount(0, { timeout: 10_000 })
  })
})
