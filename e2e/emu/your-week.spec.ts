import { test, expect } from "@playwright/test"

/**
 * /week against the seeded emulator — the digest's in-app destination reads
 * the week through the notification lens.
 *
 * The seeded test user has no prefs doc, so the mode is the default
 * "curated+essential": Essentials remind by tier default, Recommended work
 * with a null flag does not. That gives a clock-independent assertion pair:
 * the seeded Essential rows appear; the Recommended "Flush the water heater"
 * (remindEnabled null) does not — and the honesty footer counts it.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — /week", () => {
  test("shows what will remind, counts what will not", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/week")

    await expect(page.getByRole("heading", { name: "Your week" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Test smoke & CO detectors").filter(visible).first()).toBeVisible()

    // Recommended, never chose → not on the reminder lens in the default mode.
    await expect(page.getByText("Flush the water heater")).toHaveCount(0)
    // …but it is not hidden from the user: the footer says how many, and where.
    await expect(page.getByText(/more tasks? in Tasks/).filter(visible).first()).toBeVisible()

    // The digest schedule is stated, and editable.
    await expect(page.getByText(/This summary arrives Sundays at 5 PM/).filter(visible).first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Change" }).filter(visible).first()).toHaveAttribute("href", "/settings#notifications")
  })
})
