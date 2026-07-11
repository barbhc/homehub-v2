import { test, expect } from "@playwright/test"

test.describe("Dashboard", () => {
  test("loads and shows greeting + stats", async ({ page }) => {
    await page.goto("/home")

    // Should show a greeting or the today strip
    const greeting = page.locator("h1")
    await expect(greeting.first()).toBeVisible({ timeout: 10_000 })

    // Stats should be visible (overdue, this week, done)
    const statsSection = page.locator("[class*=grid-cols-3]").first()
    await expect(statsSection).toBeVisible()
  })

  test("tier filter chips are visible and interactive", async ({ page }) => {
    await page.goto("/home")
    await page.waitForLoadState("networkidle")

    // Essential chip should be active by default
    const essentialChip = page.getByRole("button", { name: /essential/i })
    await expect(essentialChip).toBeVisible()
    await expect(essentialChip).toHaveAttribute("aria-pressed", "true")

    // Recommended should be inactive by default
    const recommendedChip = page.getByRole("button", { name: /recommended/i })
    await expect(recommendedChip).toBeVisible()
    await expect(recommendedChip).toHaveAttribute("aria-pressed", "false")

    // Click recommended to toggle it on
    await recommendedChip.click()
    await expect(recommendedChip).toHaveAttribute("aria-pressed", "true")
  })

  test("calendar is visible on desktop", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "Calendar is in a different position on mobile")
    await page.goto("/home")
    await page.waitForLoadState("networkidle")

    // Calendar should show day headers
    await expect(page.getByText("Mon")).toBeVisible()
    await expect(page.getByText("Tue")).toBeVisible()
  })

  test("quick action links navigate correctly", async ({ page }) => {
    await page.goto("/home")
    await page.waitForLoadState("networkidle")

    await page.getByRole("link", { name: /add item/i }).first().click()
    await expect(page).toHaveURL(/\/inventory\/add/)
  })
})
