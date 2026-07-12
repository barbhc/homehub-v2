import { test, expect } from "@playwright/test"

/**
 * Items/inventory module against the seeded emulator — proves itemService
 * (getItemUnits) reads the seeded item_unit docs from Firestore end-to-end.
 */
test.describe("emulator e2e — inventory", () => {
  test("Inventory lists the seeded items (itemService.getItemUnits end-to-end)", async ({ page }) => {
    await page.goto("/inventory")
    // The summary reflects the seeded count/grouping (6 items, 3 rooms) — a stable
    // single-element proof that getItemUnits returned all seeded item_unit docs.
    await expect(page.getByText(/6 items across 3 rooms/i)).toBeVisible({ timeout: 20_000 })
    // And a specific seeded item card renders (targeted by its link).
    await expect(page.getByRole("link", { name: /Bosch 800 Series Dishwasher/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /Carrier Infinity Furnace/ })).toBeVisible()
  })
})
