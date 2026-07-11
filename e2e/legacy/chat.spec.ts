import { test, expect } from "@playwright/test"

test.describe("Chat", () => {
  test("chat page loads with input", async ({ page }) => {
    await page.goto("/chat")
    await page.waitForLoadState("networkidle")

    // Should show a text input or textarea for asking questions
    const input = page.locator("textarea, input[type=text]").first()
    await expect(input).toBeVisible()
  })
})
