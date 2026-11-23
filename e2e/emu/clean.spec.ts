import { test, expect } from "@playwright/test"

/**
 * Tasks → Cleaning (what was the Deep Clean hub, /clean) against the seeded
 * emulator — proves cleanSession.ts reads cleaning task_templates + instances
 * from Firestore end-to-end. The "Cleaning guides" grid comes from
 * getDeepCleanGuides, which (with no user-source home routines seeded) falls
 * back to getCleaningTasks de-duped by item. The dishwasher's seeded cleaning
 * task ("Descale the dishwasher") yields a deterministic guide label.
 *
 * Also the move itself (design/tasks-items-views.md): /clean redirects to the
 * view, and the Upkeep | Cleaning control switches it and writes ?view=.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — Tasks → Cleaning (cleanSession reads)", () => {
  test("/clean lands on Tasks → Cleaning, which shows a guide derived from seeded cleaning tasks", async ({ page }) => {
    await page.goto("/clean")
    await expect(page).toHaveURL(/\/maintenance\?view=cleaning$/)
    await expect(
      page.getByText("Clean the Bosch 800 Series Dishwasher").filter(visible).first()
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("heading", { level: 1, name: "Tasks" }).filter(visible)).toBeVisible()
    await expect(page.getByText(/^\d+ cleaning guides?$/).filter(visible)).toBeVisible()
    // Clean's own "This week" list is gone (not rendered): the week is one list, in Upkeep.
    await expect(page.getByText("This week", { exact: true })).toHaveCount(0)
  })

  test("the control switches Upkeep ⇄ Cleaning and writes ?view=", async ({ page }) => {
    await page.goto("/maintenance")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    await page.getByRole("tab", { name: "Cleaning" }).filter(visible).click()
    await expect(page).toHaveURL(/\/maintenance\?view=cleaning$/)
    await expect(page.getByText("Start cleaning").filter(visible)).toBeVisible()
    // Upkeep's own controls are not rendered in Cleaning.
    await expect(page.getByRole("button", { name: /^(Urgency|Room|Item|Calendar)$/i })).toHaveCount(0)
    await page.getByRole("tab", { name: "Upkeep" }).filter(visible).click()
    await expect(page).toHaveURL(/\/maintenance$/)
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible()
  })
})
