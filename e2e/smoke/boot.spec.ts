import { test, expect } from "@playwright/test"

/**
 * Phase 1 boot smoke — runs WITHOUT seeded data or emulators (the shim boots
 * with inert stubs). Proves the scaffold renders: landing, auth card, and the
 * auth gate on a protected route. The full flow/visual/a11y suites re-enable
 * once the emulator seed lands (Phase 2/3); CI runs only this spec until then.
 */
test.describe("v2 boot smoke", () => {
  test("landing renders", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Everything your home needs, in one place.")).toBeVisible()
    await expect(page.getByRole("button", { name: /get started/i })).toBeVisible()
  })

  test("sign-in card renders at /signin", async ({ page }) => {
    await page.goto("/signin")
    await expect(page.getByText("Welcome back")).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible()
  })

  test("protected route gates to auth instead of crashing", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto("/home")
    // Unauthenticated → the gate must route away from the app shell (no crash,
    // no blank screen). Accept either the landing or an auth screen.
    await expect(
      page.getByText(/Everything your home needs|Welcome back/).first()
    ).toBeVisible({ timeout: 10_000 })
    expect(errors, errors.join(" | ")).toHaveLength(0)
  })
})
