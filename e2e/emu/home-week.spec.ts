import { test, expect } from "@playwright/test"

/**
 * Home Option 2 on the seeded emulator: "This week at home" is EXPANDED on the
 * page and shows the rest of the week the hero does not already list.
 *
 * The user-value path: the seeded "Flush the water heater" is Recommended
 * with a null flag (due in 4 days), so it is on neither the hero nor the
 * week list. Turning it on through Your reminders must put it on Home's
 * week list — without duplicating anything the hero shows.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — Home: This week at home", () => {
  test("a reminder turned on appears on Home's week list, expanded", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    // Mobile + desktop Homes are both in the DOM; only one is visible.
    const section = () => page.getByTestId("this-week").filter(visible)

    await page.goto("/home")
    await expect(section()).toBeVisible({ timeout: 20_000 })
    await expect(section().getByText("This week at home")).toBeVisible()
    await expect(section().getByText("Flush the water heater")).toHaveCount(0)

    await page.goto("/reminders")
    await page.getByRole("button", { name: "Skip — pick from your tasks" }).click()
    await page.getByLabel("Search your tasks").fill("water heater")
    await page.getByRole("button", { name: "Add Flush the water heater" }).click()
    await page.getByRole("button", { name: /Turn these on · 1/ }).click()
    await expect(page.getByText("1 reminder on.")).toBeVisible({ timeout: 15_000 })

    await page.goto("/home")
    await expect(section().getByText("Flush the water heater")).toBeVisible({ timeout: 20_000 })
    await expect(section().getByRole("link", { name: /this week/ })).toHaveAttribute("href", "/week")
    // The hero's own rows are untouched, and no task is listed twice.
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toHaveCount(1)
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })
})
