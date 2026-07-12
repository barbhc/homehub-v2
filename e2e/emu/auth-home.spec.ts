import { test, expect } from "@playwright/test"

/**
 * End-to-end against the SEEDED emulator — the real Firebase service layer, not
 * the shim. Grows one block per migrated module. Today it covers:
 *  - auth (email/pw sign-in → the authenticated storage state from auth.setup)
 *  - home (getPrimaryHome resolves the seeded home so HomeGate lets you in;
 *    getRooms returns the seeded rooms in Settings)
 */
test.describe("emulator e2e — auth + home", () => {
  test("authenticated user reaches the app (home gate passes, not bounced)", async ({ page }) => {
    await page.goto("/home")
    await expect(page).toHaveURL(/\/home/)
    // Not bounced to sign-in or onboarding → getPrimaryHome found the seeded home.
    await expect(page).not.toHaveURL(/\/signin/)
    await expect(page).not.toHaveURL(/\/onboarding/)
    // The authenticated app shell renders (the Homehub nav banner is present in
    // AppLayout — a stable, layout-agnostic signal we're inside the app).
    await expect(page.getByRole("link", { name: "Homehub" }).first()).toBeVisible({ timeout: 15_000 })
  })

  test("Settings lists the seeded rooms (homeService.getRooms end-to-end)", async ({ page }) => {
    await page.goto("/settings")
    // Seeded rooms from scripts/seed-emulator.ts, read via the Firestore homeService.
    await expect(page.getByText("Kitchen").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Garage").first()).toBeVisible()
    await expect(page.getByText("Laundry Room").first()).toBeVisible()
  })

  test("Settings shows the seeded home profile (homeProfileService.getHomeProfile end-to-end)", async ({ page }) => {
    await page.goto("/settings")
    // The Home profile section reads the folded home doc — the seeded home_type
    // "house" surfaces as the "House" selection in its combobox.
    await expect(page.getByText("Home profile").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("combobox").filter({ hasText: "House" }).first()).toBeVisible({ timeout: 10_000 })
  })
})
