import { test, expect } from "@playwright/test"

/**
 * "Your week" and "Your reminders" are PARKED (design/settings-your-home.md,
 * audit finding 12): the pages are kept in the repo and routed by nothing.
 * Their addresses still land somewhere right — a weekly-summary or buy-ahead
 * push already delivered says /week?home=…, and old links say /reminders.
 *
 * This replaces your-week.spec.ts and your-reminders.spec.ts, which walked
 * the two pages; what those pages do stays pinned by their unit tests
 * (src/pages/YourWeek.test.tsx, YourReminders*.test.tsx).
 */
const visible = { visible: true } as const

test.describe("emulator e2e — parked pages", () => {
  test("/week lands on Tasks", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/week")
    await expect(page).toHaveURL(/\/maintenance$/, { timeout: 20_000 })
    await expect(page.getByRole("heading", { level: 1, name: "Tasks" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    // Not the parked page (not rendered).
    await expect(page.getByRole("heading", { name: "Your week" })).toHaveCount(0)
  })

  test("a push's /week?home=… lands on Tasks for that home", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/week?home=e2e-home")
    await expect(page).toHaveURL(/\/maintenance$/, { timeout: 20_000 })
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 20_000 })
  })

  test("/reminders lands on Settings → Notifications", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/reminders")
    await expect(page).toHaveURL(/\/settings\/notifications$/, { timeout: 20_000 })
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("heading", { name: "Your reminders" })).toHaveCount(0)
  })
})
