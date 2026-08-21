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
  test("the default hides nothing; 'Needs you' is an opt-in lens", async ({ page }) => {
    // This test used to assert the OPPOSITE — that the default filtered down to
    // essentials and "All" revealed the rest. That default was deliberately
    // removed: the owner questioned the filter twice, and the second time the
    // page was reporting "2 to do" while quietly hiding nine more. A default
    // that filters is a default that hides, and grouping by Urgency already
    // puts what needs you first without pretending the rest does not exist.
    // See the rationale on useTierFilter in components/home/tasks/shared.ts.
    //
    // The test was never updated, so it kept asserting the behaviour that the
    // product had rejected — and with CI unable to run, nothing said so.
    await page.goto("/maintenance")

    // Both tiers present by default. The essential one:
    await expect(
      page.getByText("Replace HVAC furnace filter").filter(visible)
    ).toBeVisible({ timeout: 20_000 })
    // …and the recommended, not-overdue one that the old default hid.
    await expect(
      page.getByText("Flush the water heater").filter(visible)
    ).toBeVisible({ timeout: 10_000 })

    // "Needs you" still exists as an opt-in lens, and still narrows to
    // essential-or-overdue. Opening it is a choice the user makes.
    await page.getByRole("button", { name: /^All/ }).filter(visible).first().click()
    await page.getByRole("option", { name: /Needs you/ }).or(page.getByRole("button", { name: /Needs you/ })).filter(visible).first().click()
    await expect(page.getByText("Flush the water heater").filter(visible)).toHaveCount(0)
  })

  test("insight banner — lapsed safety work earns the 'Worth doing' nudge", async ({ page }) => {
    await page.goto("/maintenance")
    // Due-windows semantics (design/due-windows.md): only a passed DEADLINE is
    // "overdue" ("Start here" banner). Recurring window work is never late — but
    // lapsed SAFETY work (the seeded smoke/CO detector test with a prior
    // completion) earns the firm-but-dateless "Worth doing" nudge instead.
    // This spec asserted the pre-windows "Start here / overdue" copy for weeks
    // of red CI — see computeInsight in components/home/tasks/shared.ts for the
    // current contract.
    await expect(page.getByText("Worth doing").filter(visible)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/safety check has skipped a cycle/i).filter(visible)).toBeVisible()
  })
})
