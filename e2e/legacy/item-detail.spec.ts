import { test, expect } from "@playwright/test"

test.describe("Item detail", () => {
  test("opening an item shows its detail page", async ({ page }) => {
    await page.goto("/inventory")
    await page.waitForLoadState("networkidle")

    const itemLink = page.locator('a[href^="/items/"]').first()
    if ((await itemLink.count()) === 0) {
      test.skip(true, "No items in the test home")
      return
    }

    await itemLink.click()
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveURL(/\/items\//)
    await expect(page.locator("main")).toBeVisible()
    // Item detail always renders a Tasks section
    await expect(page.getByText(/tasks/i).first()).toBeVisible()
  })
})
