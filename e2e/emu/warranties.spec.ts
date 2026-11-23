import { test, expect } from "@playwright/test"

/**
 * Items → Warranties (what was the Warranties page, /warranties) against the
 * seeded emulator (design/tasks-items-views.md): the old address redirects to
 * the view, the Items | Warranties control switches it and writes ?view=, and
 * the view is drawn from the items the Items page already read — the seeded
 * Bosch dishwasher's coverage, "Covered · {date}" with "Bosch · Kitchen".
 */
const visible = { visible: true } as const

test.describe("emulator e2e — Items → Warranties", () => {
  test("/warranties lands on Items → Warranties", async ({ page }) => {
    await page.goto("/warranties")
    await expect(page).toHaveURL(/\/inventory\?view=warranties$/)
    await expect(page.getByText(/Bosch · Kitchen/i).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("heading", { level: 1, name: "Items" }).filter(visible)).toBeVisible()
    await expect(page.getByRole("tab", { name: "Warranties", selected: true }).filter(visible)).toHaveCount(1)
    // Its own title and subtitle are gone (not rendered): the page is Items.
    await expect(page.getByRole("heading", { name: "Warranties" })).toHaveCount(0)
    await expect(page.getByText("Coverage across your home, at a glance.")).toHaveCount(0)
  })

  test("the control switches Items ⇄ Warranties and writes ?view=", async ({ page }) => {
    await page.goto("/inventory")
    await expect(page.getByText("Bosch 800 Series Dishwasher", { exact: true }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("tab", { name: "Warranties" }).filter(visible).click()
    await expect(page).toHaveURL(/\/inventory\?view=warranties$/)
    await expect(page.getByText(/Covered ·|Lapsed ·/i).filter(visible).first()).toBeVisible()
    // The list's own controls are not rendered in Warranties.
    await expect(page.getByPlaceholder(/Search \d+ items/)).toHaveCount(0)
    await page.getByRole("tab", { name: "Items" }).filter(visible).click()
    await expect(page).toHaveURL(/\/inventory$/)
    await expect(page.getByText(/Covered ·|Lapsed ·/i)).toHaveCount(0)
  })
})
