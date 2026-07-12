import { test, expect } from "@playwright/test"

/**
 * Deep Clean hub against the seeded emulator — proves cleanSession.ts reads
 * cleaning task_templates + instances from Firestore end-to-end. The hub's
 * "Cleaning guides" grid comes from getDeepCleanGuides, which (with no
 * user-source home routines seeded) falls back to getCleaningTasks de-duped by
 * item. The dishwasher's seeded cleaning task ("Descale the dishwasher") yields
 * a deterministic guide label.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — deep clean (cleanSession reads)", () => {
  test("hub shows a cleaning guide derived from seeded cleaning tasks", async ({ page }) => {
    await page.goto("/clean")
    await expect(
      page.getByText("Clean the Bosch 800 Series Dishwasher").filter(visible).first()
    ).toBeVisible({ timeout: 20_000 })
  })
})
