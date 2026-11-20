import { test, expect } from "@playwright/test"

/**
 * D4 — Settings › Task level, end to end on the seeded emulator: the choice is
 * written through the real taskLevelService (one batch: the home's level and
 * the hidden marks on its task templates, against real Firestore rules), and
 * the Tasks page is READ BACK after each change.
 *
 * Mock, screen 2: https://claude.ai/artifact/Ao4AvquYrsTwZDs4oUUSuo#level
 *
 * NAMED zz- ON PURPOSE. Specs in one run share the seeded emulator, and this
 * one changes what every Tasks and Home list shows for the whole home. It puts
 * the level back to Everything at the end (every mark cleared), but the home
 * then carries a CHOSEN level, which a fresh read's review names — so it runs
 * after every other spec in this suite rather than ahead of any of them.
 *
 * Seeded tasks this walk relies on (scripts/seed-emulator.ts):
 *   Replace HVAC furnace filter  essential                 → never hidden
 *   Flush the water heater       recommended               → hidden at Essential only
 *   Vacuum refrigerator coils    recommended, reminder ON  → never hidden (chosen by hand)
 */
const visible = { visible: true } as const
const level = (page: import("@playwright/test").Page, name: RegExp) => page.getByRole("button", { name }).filter(visible).first()

test.describe("emulator e2e — task level", () => {
  test("lowering the level hides tasks and says so; raising it brings them back", async ({ page }) => {
    // Before: the home has never chosen a level, so nothing is hidden.
    await page.goto("/maintenance")
    await expect(page.getByText("Flush the water heater").filter(visible)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/hidden by your task level/)).toHaveCount(0)
    const coilsListed = (await page.getByText("Vacuum refrigerator coils").filter(visible).count()) > 0

    // A home from before the setting shows Everything selected.
    await page.goto("/settings#task-level")
    await expect(level(page, /^Everything/)).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
    await expect(page.getByText("This changes what shows. Nothing is deleted.").filter(visible)).toBeVisible()

    // Lower it. The card shows the SAVED level, so pressed means written.
    await level(page, /^Essential only/).click()
    await expect(level(page, /^Essential only/)).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
    await expect(level(page, /^Everything/)).toHaveAttribute("aria-pressed", "false")

    // Read back on a fresh load of Tasks.
    await page.goto("/maintenance")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Flush the water heater").filter(visible)).toHaveCount(0)
    // A Recommended task whose reminder was switched on by hand stays.
    if (coilsListed) await expect(page.getByText("Vacuum refrigerator coils").filter(visible)).toBeVisible()
    // The list says what it is leaving out, and where to change that.
    const note = page.getByRole("link", { name: /hidden by your task level/ }).filter(visible).first()
    await expect(note).toBeVisible()
    await note.click()
    await expect(page).toHaveURL(/\/settings#task-level$/)

    // And it survived the reload that navigation just did.
    await expect(level(page, /^Essential only/)).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })

    // Raise it: nothing was deleted.
    await level(page, /^Everything/).click()
    await expect(level(page, /^Everything/)).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
    await page.goto("/maintenance")
    await expect(page.getByText("Flush the water heater").filter(visible)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/hidden by your task level/)).toHaveCount(0)
  })
})
