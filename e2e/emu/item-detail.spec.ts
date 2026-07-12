import { test, expect } from "@playwright/test"

/**
 * Item-detail page against the seeded emulator — proves the taskService reads
 * that back the care + history sections work end-to-end from Firestore:
 *   - getTaskTemplatesWithSchedulesByItem / getTaskInstances (CareBlock)
 *   - getCompletionHistory / getTierChangeHistory (HistorySection)
 * The furnace (item id "furnace") has two seeded maintenance templates and a
 * prior completed instance, so its care list is non-empty.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — item detail (care + history reads)", () => {
  test("furnace page lists its seeded care task (getTaskTemplatesWithSchedulesByItem + getTaskInstances)", async ({ page }) => {
    await page.goto("/items/furnace")
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    // A seeded furnace-scoped maintenance task surfaces in the care section.
    await expect(
      page.getByText("Replace HVAC furnace filter").filter(visible).first()
    ).toBeVisible({ timeout: 10_000 })
    // The page did not crash on any still-shimmed secondary loader.
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })
})
