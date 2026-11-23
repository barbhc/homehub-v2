import { test, expect } from "@playwright/test"

/**
 * End-to-end against the SEEDED emulator — the real Firebase service layer, not
 * the shim. Grows one block per migrated module. Today it covers:
 *  - auth (email/pw sign-in → the authenticated storage state from auth.setup)
 *  - home (getPrimaryHome resolves the seeded home so HomeGate lets you in;
 *    getRooms returns the seeded rooms on Items → Edit rooms)
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

  test("Rooms lists the seeded rooms (homeService.getRooms end-to-end)", async ({ page }) => {
    // Rooms left Settings for Items → Edit rooms (design/settings-your-home.md).
    await page.goto("/inventory/rooms")
    await expect(page.getByRole("heading", { level: 1, name: "Rooms" })).toBeVisible({ timeout: 15_000 })
    // Seeded rooms from scripts/seed-emulator.ts, read via the Firestore homeService.
    const rooms = page.getByTestId("rooms-manager")
    await expect(rooms.getByRole("button", { name: "Kitchen", exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(rooms.getByRole("button", { name: "Garage", exact: true })).toBeVisible()
    await expect(rooms.getByRole("button", { name: "Laundry Room", exact: true })).toBeVisible()
  })

  test("Your home shows the seeded home profile (homeProfileService.getHomeProfile end-to-end)", async ({ page }) => {
    // The basics left Settings for Your home. The editor reads the folded home
    // doc — the seeded home_type "house" surfaces as "House" in its combobox.
    await page.goto("/your-home?part=basics")
    await expect(page.getByRole("heading", { level: 1, name: "The basics" })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("combobox").filter({ hasText: "House" }).first()).toBeVisible({ timeout: 10_000 })
  })

  test("Settings → Account: the name loads from users/{uid} (profile read end-to-end)", async ({ page }) => {
    await page.goto("/settings/account")
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible({ timeout: 15_000 })
    // The display-name input hydrates from users/{uid}.fullName — the seeded
    // profile is "E2E Tester".
    await expect(page.locator("#profile-name").first()).toHaveValue("E2E Tester", { timeout: 15_000 })
  })

  test("Settings → Members lists the seeded home member (inviteService.getHomeMembers end-to-end)", async ({ page }) => {
    await page.goto("/settings/members")
    // Reads homes/{homeId}/members + the users/{uid} profile — the seeded
    // owner surfaces by full name.
    const members = page.getByTestId("settings-pane-members")
    await expect(members.getByRole("heading", { level: 1, name: "Members" })).toBeVisible({ timeout: 15_000 })
    await expect(members.getByText("E2E Tester").first()).toBeVisible({ timeout: 10_000 })
  })
})
