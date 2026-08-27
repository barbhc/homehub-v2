import { test, expect } from "@playwright/test"

/**
 * The review, driven end-to-end on the seeded emulator.
 *
 * Round 18 rewrote this. It used to walk the two-screen flow — "Review them
 * all", then "Next: schedule N tasks" — and assert the tier sections' copy.
 * There is one screen now, grouped by kind, so those steps have nothing to
 * click. What the spec is FOR is unchanged and is the reason it survived the
 * rewrite: prove that opening the review from the item page, changing something
 * and saving actually writes back, against real Firestore rules.
 */
test.describe("emulator e2e — task review", () => {
  test("reviews an existing item's tasks and writes the result back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/dishwasher")
    await expect(page.getByText("Bosch 800 Series Dishwasher").filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })

    // The entry point that lets EXISTING tasks reach the review at all —
    // ItemDetailPage renders the compact button in the Upkeep heading.
    const entry = page.getByRole("button", { name: /^Review tasks$/ }).filter({ visible: true }).first()
    await expect(entry).toBeVisible({ timeout: 10_000 })
    await entry.click()

    // The summary states both channels apart. The seeded dishwasher's only task
    // is a monthly cleaning job: it comes back in Tasks, and it does not notify,
    // because Essential is the only notify-by-default.
    await expect(page.getByText(/show(s)? up in Tasks/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/None will notify your phone/i).first()).toBeVisible()

    // It is a Cleaning row, in a Cleaning section — one vocabulary, and the
    // section says what it means rather than promising a reminder.
    await expect(page.getByText("Keeps it nice. Lives on the item page.").first()).toBeVisible()

    // No step machinery survives.
    await expect(page.getByRole("button", { name: /Review them all/ })).toHaveCount(0)
    await expect(page.getByText(/Step \d of 2/)).toHaveCount(0)

    // Open the row: kind, importance, cadence and the reminder are one panel.
    await page.getByRole("button", { name: /Descale the dishwasher/ }).first().click()
    await expect(page.getByText("What is it?")).toBeVisible()
    await expect(page.getByText("How important?")).toBeVisible()
    await expect(page.getByText("How often?")).toBeVisible()

    // The cadence editor moved here from the deleted second screen; prove it
    // still works, since losing it was the near-miss of this change.
    await page.getByRole("button", { name: /^Quarterly$/ }).filter({ visible: true }).first().click()

    // Turning the reminder on is the other half — a Recommended task can get a
    // bell without being inflated to Essential.
    const remind = page.getByRole("checkbox", { name: /Remind me when it/ })
    await expect(remind).not.toBeChecked()
    await remind.check()

    await page.getByRole("button", { name: /^Done$/ }).click()

    // One button now, and it is the only thing that writes.
    const save = page.getByRole("button", { name: /^Save/ }).last()
    await expect(save).toBeVisible()
    await save.click()

    // Sheet closes → the write landed without an error surfacing.
    await expect(page.getByText("What is it?")).toHaveCount(0, { timeout: 15_000 })
  })
})
