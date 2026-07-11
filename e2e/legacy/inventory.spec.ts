import { test, expect } from "@playwright/test"

test.describe("Inventory", () => {
  test("inventory page loads with items or empty state", async ({ page }) => {
    await page.goto("/inventory")
    await page.waitForLoadState("networkidle")

    // Should show either items or an empty state
    const content = page.locator("main")
    await expect(content).toBeVisible()

    // Page should have an "Add" action
    const addLink = page.getByRole("link", { name: /add/i }).first()
    await expect(addLink).toBeVisible()
  })

  test("add item page loads", async ({ page }) => {
    await page.goto("/inventory/add")
    await page.waitForLoadState("networkidle")

    // Should show the add item form
    await expect(page.locator("main")).toBeVisible()
  })
})
