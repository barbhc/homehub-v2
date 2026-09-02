import { test, expect } from "@playwright/test"

/**
 * The part inside its task, end to end on the seeded emulator: add a part to
 * the furnace filter task, give it a link, turn buy-ahead on — and both
 * survive a reload (the transactional writers, not local state). Then the
 * part shows up under "Buy first" on /week, because the seeded furnace task
 * is due this week.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — supplies inside the task", () => {
  test("add a part, link it, turn buy-ahead on; it persists and reaches Buy first", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/furnace")
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // Open the task's how-to; the part block lives with the task.
    const row = page.getByText("Replace HVAC furnace filter").filter(visible).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()

    await page.getByRole("button", { name: "Add a part" }).filter(visible).first().click()
    await page.getByLabel("Part name").fill("Furnace filter")
    await page.getByLabel("Part link").fill("https://www.filterbuy.com/16x25x1")
    await page.getByLabel("Part size").fill("16x25x1")
    await page.getByRole("button", { name: "Save part" }).click()

    await expect(page.getByRole("link", { name: /^Buy/ }).filter(visible).first()).toHaveAttribute("href", "https://www.filterbuy.com/16x25x1")
    await expect(page.getByLabel("Remind me to buy the next Furnace filter")).toBeChecked()

    // Reload: the screen must be reading Firestore, not remembering a click.
    await page.reload()
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()
    await expect(page.getByText(/16x25x1 · filterbuy.com/).filter(visible).first()).toBeVisible()
    await expect(page.getByLabel("Remind me to buy the next Furnace filter")).toBeChecked()

    // The seeded furnace task is due this week → the part is a Buy-first row.
    await page.goto("/week")
    await expect(page.getByText("Buy first").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Furnace filter · 16x25x1").filter(visible).first()).toBeVisible()
  })
})
