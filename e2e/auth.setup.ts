import { test as setup, expect } from "@playwright/test"
import { TEST_EMAIL, TEST_PASSWORD } from "./seed-config"

/**
 * Logs the seeded test user in once and saves the authenticated storage state
 * (cookies + localStorage) for every other project to reuse. Also pins the
 * interface level to "advanced" so the desktop nav shows ALL surfaces
 * (Clean / Warranties / Providers) for full-coverage screenshots.
 *
 * Run `npm run seed:test` first so this user exists with deterministic data.
 */
setup("authenticate", async ({ page }) => {
  // Sign-in moved off "/" (now the marketing landing) to its own /signin route.
  await page.goto("/signin")

  // The sign-in form labels aren't associated to inputs, and placeholders are
  // "you@email.com" / "••••••••" — so target by input type (robust).
  await page.locator('input[type="email"]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.getByRole("button", { name: /^sign in$/i }).click()

  // Wait for redirect into the authenticated app.
  await expect(page).toHaveURL(/\/(home|onboarding)/, { timeout: 15_000 })

  // Ensure supabase-js has actually persisted the session to localStorage
  // before we snapshot storage state (otherwise dependent specs load with no
  // session and AuthGate bounces them to "/").
  await page.waitForFunction(
    () =>
      Object.keys(window.localStorage).some(
        (k) => k.includes("-auth-token") && !!window.localStorage.getItem(k)
      ),
    { timeout: 10_000 }
  )

  // Force the "advanced" (power) interface level so the full nav renders.
  // This is the synchronous cache the UI reads; the DB pref backs it up too.
  await page.evaluate(() => {
    window.localStorage.setItem("homehub:interface-level", "advanced")
  })

  await page.context().storageState({ path: "e2e/.auth/user.json" })
})
