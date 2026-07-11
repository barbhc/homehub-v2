import { test as setup, expect } from "@playwright/test"
import { TEST_EMAIL, TEST_PASSWORD } from "./seed-config"

/**
 * Signs the seeded test user into the Auth EMULATOR once and saves the
 * authenticated storage state for the emu projects to reuse. Firebase persists
 * auth to IndexedDB (not localStorage like Supabase did), so we snapshot with
 * `indexedDB: true`.
 *
 * Preconditions: emulators running + `npm run seed:emu` has created the user and
 * the home. Orchestrated by `npm run test:e2e:emu`.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/signin")

  await page.locator('input[type="email"]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.getByRole("button", { name: /^sign in$/i }).click()

  // Redirect into the authenticated app (home if a home exists, else onboarding).
  await expect(page).toHaveURL(/\/(home|onboarding)/, { timeout: 15_000 })

  // Force the "advanced" interface level so the full nav renders for coverage.
  await page.evaluate(() => {
    window.localStorage.setItem("homehub:interface-level", "advanced")
  })

  // Snapshot cookies + localStorage + IndexedDB (Firebase auth lives in IDB).
  await page.context().storageState({ path: "e2e/.auth/user.json", indexedDB: true })
})
