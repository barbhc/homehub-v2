import { test, expect } from "@playwright/test"

/**
 * Smart Add (P0) against the seeded emulator — proves the flagship add-item flow
 * creates a real Firestore item end-to-end (createItemUnit on
 * homes/{homeId}/items) instead of dead-ending on the legacy inventoryService
 * ("Could not create item" on the inert shim, the audit's P0 bug).
 *
 * Drives the manual-entry path: /inventory/add (name-first — the form opens in
 * manual mode since 4ca3db4) → name → "Add item" → lands on the detail page.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — smart add (createItemUnit P0)", () => {
  test("manual-entry add creates an item and lands on its detail page", async ({ page }) => {
    await page.goto("/inventory/add")

    // Name is the only required field (the form opens in manual mode).
    await page.locator("#identify-name").fill("Emu Test Toaster")
    await page.getByRole("button", { name: /^Add item$/ }).filter(visible).first().click()

    // createItemUnit succeeded → navigate to /items/{item_unit_id} and the item
    // detail page renders the new item's name from Firestore.
    await expect(page).toHaveURL(/\/items\//, { timeout: 15_000 })
    await expect(page.getByText("Emu Test Toaster").filter(visible).first()).toBeVisible({ timeout: 15_000 })
  })
})
