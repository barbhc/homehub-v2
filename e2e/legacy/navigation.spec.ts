import { test, expect } from "@playwright/test"

test.describe("Navigation", () => {
  test("all main nav links work", async ({ page }) => {
    await page.goto("/home")
    await page.waitForLoadState("networkidle")

    // Tasks
    await page.getByRole("link", { name: /tasks/i }).first().click()
    await expect(page).toHaveURL("/maintenance")
    await expect(page.locator("h1, [class*=PageHeader]").first()).toBeVisible()

    // Inventory
    await page.getByRole("link", { name: /inventory/i }).first().click()
    await expect(page).toHaveURL("/inventory")

    // Ask / Chat
    await page.getByRole("link", { name: /ask/i }).first().click()
    await expect(page).toHaveURL("/chat")

    // Settings
    await page.getByRole("link", { name: /settings/i }).first().click()
    await expect(page).toHaveURL("/settings")

    // Home
    await page.getByRole("link", { name: /home/i }).first().click()
    await expect(page).toHaveURL("/home")
  })

  test("404 page shows for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-page")
    await expect(page.getByText(/not found|404/i)).toBeVisible({ timeout: 5_000 })
  })
})
