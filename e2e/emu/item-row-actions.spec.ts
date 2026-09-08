import { test, expect } from "../fixtures"

/**
 * HH-157 — the item page's task row carries the task's verbs (canvas E2):
 * Mark done, then Snooze · Edit · Open task. Mark done is a callable
 * (completeTask) that needs the functions emulator, so it is proven in the
 * unit contract; this walk covers the three pure-Firestore verbs end to end
 * on the seeded furnace, and leaves the seed as it found it (Undo).
 */
const visible = { visible: true } as const

test.describe("emulator e2e — the item page's row verbs", () => {
  test("See how opens the row with its verbs; Snooze is undoable; Edit opens Review tasks; Open task reaches the task", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/furnace")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // The row opens on "See how"; its verbs sit at the bottom of the panel.
    const row = page.getByTestId("care-row").filter({ hasText: "Replace HVAC furnace filter" }).filter(visible).first()
    await row.getByRole("button", { name: /See how/ }).click()
    // The panel is the row's sibling (the care-row testid marks the header),
    // and only one row is open — so the visible actions block is this one's.
    const acts = page.getByTestId("row-actions").filter(visible).first()
    await expect(acts).toBeVisible({ timeout: 10_000 })
    await expect(acts.getByRole("button", { name: "Mark done" })).toBeVisible()
    await expect(acts.getByRole("button", { name: /Snooze/ })).toBeVisible()
    await expect(acts.getByRole("button", { name: /Edit/ })).toBeVisible()
    await expect(acts.getByRole("button", { name: /Open task/ })).toBeVisible()

    // Snooze says what happened and offers the way back — then we take it.
    await acts.getByRole("button", { name: /Snooze/ }).click()
    const undo = page.getByRole("button", { name: /Undo/ }).filter(visible).first()
    await expect(page.getByText(/Snoozed until/).filter(visible).first()).toBeVisible({ timeout: 10_000 })
    await undo.click()
    await expect(page.getByText(/Snoozed until/)).toHaveCount(0, { timeout: 10_000 })

    // Edit opens the item's Review tasks sheet.
    await acts.getByRole("button", { name: /Edit/ }).click()
    await expect(page.getByRole("dialog").filter(visible).first()).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press("Escape")

    // Open task reaches the task's own page.
    await acts.getByRole("button", { name: /Open task/ }).click()
    await page.waitForURL(/\/tasks\//, { timeout: 15_000 })
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 15_000 })
  })
})
