import { test, expect } from "@playwright/test"

/**
 * tasks/care against the seeded emulator — proves getWeekAgenda reads the
 * denormalized taskInstances end-to-end AND that Fix A (calm-by-default) behaves
 * on real data: the default Focus view shows essential work, hides the
 * recommended/optional tail, and one tap on "All" reveals it.
 *
 * Clock is intentionally NOT pinned (a past-pinned clock can invalidate the
 * Firebase session). The assertions are clock-independent: the seeded essentials
 * are always in Focus; the recommended "Flush the water heater" is never in Focus
 * (not essential, no completed sibling → not overdue) until All is selected.
 *
 * Maintenance renders three copies of the list (mobile RefinedWeek, desktop
 * DesktopTasks, and a hidden legacy hub), so every assertion filters to the
 * VISIBLE one — at the desktop viewport that's DesktopTasks.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — tasks (getWeekAgenda + Fix A)", () => {
  test("default Focus shows essentials; All reveals the recommended tail", async ({ page }) => {
    // The redesigned tasks screen (RefinedWeek/DesktopTasks with Fix A) lives at
    // /maintenance — the nav's "Tasks" link. (/tasks is the legacy page.)
    await page.goto("/maintenance")

    // Essential, seeded → present in the default Focus view (getWeekAgenda E2E).
    await expect(
      page.getByText("Replace HVAC furnace filter").filter(visible)
    ).toBeVisible({ timeout: 20_000 })

    // Recommended + not overdue → calmed out of the visible Focus list by default.
    await expect(page.getByText("Flush the water heater").filter(visible)).toHaveCount(0)

    // One tap on the (visible) All chip reveals the full list.
    await page.getByRole("button", { name: /^All/ }).filter(visible).click()
    await expect(
      page.getByText("Flush the water heater").filter(visible)
    ).toBeVisible({ timeout: 10_000 })
  })
})
