import { test, expect } from "@playwright/test"

/**
 * Home feed against the seeded emulator — proves getDashboardTasks reads the
 * denormalized taskInstances end-to-end (the hero + Upcoming list, where Fix A's
 * UPCOMING_CAP renders). Secondary surfaces (warranties/notices/upkeep) are on
 * the inert shim for now, so they render empty rather than crashing the page.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — home feed", () => {
  test("Home renders seeded tasks (getDashboardTasks end-to-end)", async ({ page }) => {
    await page.goto("/home")
    await expect(page).toHaveURL(/\/home/)
    // A seeded essential surfaces in the Home feed (hero or Upcoming).
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    // The page did not crash on the still-shimmed secondary loaders.
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })

  test("See how expands a task's real detail (getTaskDetail end-to-end)", async ({ page }) => {
    await page.goto("/home")
    // The furnace filter (essential, most overdue) is the Focus hero; its "See
    // how" is a <button> (Agenda rows use a <span>), so the role selector lands
    // on the hero card.
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()
    // The template's justification (why-it-matters) renders only after
    // getTaskDetail resolves the taskInstance → taskTemplate read.
    await expect(
      page.getByText(/clogged filter strains the blower/i).filter(visible)
    ).toBeVisible({ timeout: 10_000 })
  })
})
