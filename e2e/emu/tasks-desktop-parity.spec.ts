import { test, expect } from "@playwright/test"

/**
 * The Tasks page against the seeded emulator — two things the desktop tree had
 * wrong, checked in a real browser (the unit tests run jsdom, which neither
 * lays out nor hides anything):
 *
 *  · HH-94's footer. The seeded home has scheduled tasks AND item-scoped
 *    cleaning (oven door glass, dishwasher descale, fridge shelves), which the
 *    agenda withholds by design. With tasks on the list, the list must still
 *    say where that work lives: "N cleaning jobs for your items live in Deep
 *    Clean →". It could never render — the count was only taken for an EMPTY
 *    agenda — and desktop had no footer at all.
 *  · The Suggested group renders ONCE at desktop width, below every task. It
 *    was nested in the groups.map and drawn inside each group's card.
 *
 * /maintenance mounts both trees (CSS shows one), so every locator is filtered
 * to the visible one.
 */
const visible = { visible: true } as const
const FOOTER = /\d+ cleaning jobs? for your items lives? in Deep Clean/

test.describe("emulator e2e — the desktop Tasks tree matches the phone's", () => {
  test("desktop: the footer names the withheld cleaning; Suggested renders once, below every task", async ({ page }) => {
    await page.goto("/maintenance")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })

    const footer = page.getByRole("link", { name: FOOTER }).filter(visible)
    await expect(footer).toHaveCount(1)
    await expect(footer).toHaveAttribute("href", "/clean")
    // At least the three seeded item-cleaning jobs.
    const n = Number((await footer.textContent())?.match(/(\d+) cleaning/)?.[1] ?? 0)
    expect(n).toBeGreaterThanOrEqual(3)
    // The headline counts the list; it does not claim it is empty.
    await expect(page.getByText(/Nothing on the schedule|Nothing due/).filter(visible)).toHaveCount(0)

    // The seed's tasks all land in ONE urgency group, where "once" and "once
    // per group" look alike. Grouped by room there are several.
    const roomLens = page.getByRole("button", { name: /^room$/i }).filter(visible)
    await roomLens.click()
    await expect(roomLens).toHaveAttribute("aria-pressed", "true")
    const suggested = page.getByTestId("suggested-group").filter(visible)
    await expect(suggested).toHaveCount(1, { timeout: 20_000 })
    const suggestedTop = await suggested.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    for (const title of ["Replace HVAC furnace filter", "Flush the water heater", "Winterize the outdoor faucet"]) {
      const row = page.getByText(title, { exact: true }).filter(visible)
      const top = await row.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
      expect(top, `"${title}" renders above Suggested`).toBeLessThan(suggestedTop)
      await expect(suggested.getByText(title, { exact: true })).toHaveCount(0)
    }
  })

  test("desktop: a failed Mark done on a LOWER row is said on that row, in view", async ({ page }) => {
    // The failure line used to sit in the page header, which a long list
    // scrolls away: a failed check-off near the bottom put nothing readable on
    // screen. The completeTask callable is failed at the network layer — no
    // write lands, so nothing in the shared emulator changes.
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" }
    await page.route("**/completeTask", (route) =>
      route.request().method() !== "POST"
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({
            status: 500, headers: cors, contentType: "application/json",
            body: JSON.stringify({ error: { status: "INTERNAL", message: "The server could not complete that task." } }),
          }))
    await page.goto("/maintenance")
    const title = "Freeze-protect the irrigation backflow"
    const row = page.getByTestId("desktop-task-row").filter({ hasText: title }).filter(visible)
    await expect(row).toBeVisible({ timeout: 20_000 })

    await row.getByRole("button", { name: "Mark done" }).click()

    const alert = row.getByRole("alert")
    await expect(alert).toBeVisible({ timeout: 10_000 })
    await expect(alert).toBeInViewport()
    // Said once — on the row, not also in the header.
    await expect(page.getByRole("alert").filter(visible)).toHaveCount(1)
    await expect(row).toContainText(title)
  })

  test("phone (390px): the same footer, and it goes to Deep Clean", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/maintenance")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })

    const footer = page.getByRole("link", { name: FOOTER }).filter(visible)
    await expect(footer).toHaveCount(1)
    await footer.click()
    await expect(page).toHaveURL(/\/clean$/)
  })
})
