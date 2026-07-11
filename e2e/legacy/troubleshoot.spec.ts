import { test, expect } from "@playwright/test"

// Troubleshooting was merged into Ask (#PR): the standalone /troubleshoot page
// is retired and now redirects into /chat, scoped to the item.
test.describe("Fix → Ask merge", () => {
  test("/troubleshoot redirects into Ask, preserving the item scope", async ({ page }) => {
    await page.goto("/troubleshoot?item=abc123")
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/chat(\?|$)/)
    await expect(page).toHaveURL(/item=abc123/)
    await expect(page.locator("main")).toBeVisible()
  })

  test("Ask loads as the single help surface", async ({ page }) => {
    await page.goto("/chat")
    await page.waitForLoadState("networkidle")
    await expect(page.getByText(/ask your home anything/i)).toBeVisible()
  })
})
