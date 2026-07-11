import { test, expect } from "@playwright/test"

test.describe("Maintenance", () => {
  test("maintenance page loads with filters", async ({ page }) => {
    await page.goto("/maintenance")
    await page.waitForLoadState("networkidle")

    // Should show the page
    await expect(page.locator("main")).toBeVisible()
  })

  test("settings page loads all sections", async ({ page }) => {
    await page.goto("/settings")
    await page.waitForLoadState("networkidle")

    // Rooms section
    await expect(page.getByText(/rooms/i).first()).toBeVisible()

    // Feature Tour section
    await expect(page.getByText(/feature tour/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /restart tour/i })).toBeVisible()

    // Data & Privacy section
    await expect(page.getByText(/data & privacy/i)).toBeVisible()
  })
})
