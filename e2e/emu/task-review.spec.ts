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
 *
 * "Writes back" means READ BACK AFTER A RELOAD. Until 2026-08-29 this spec
 * ended on `expect(getByText("What is it?")).toHaveCount(0)` — a label inside
 * the expanded ROW, which the row's Done button had already collapsed. The
 * assertion was satisfied before Save was ever clicked, so the suite was green
 * and the write it exists to prove was never observed.
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

    // The summary speaks in the Tasks page's own terms (HH-161). The seeded
    // dishwasher's only task is a monthly ITEM cleaning job, which the Tasks
    // page never lists (isAgendaEligible) and the push sweep never sends — so
    // nothing here goes into Tasks, and with nothing there, no notify line.
    // (This walk used to assert "shows up in Tasks" here: the false promise.)
    await expect(page.getByText("Nothing here goes into Tasks.").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/will show up in Tasks|will notify/i)).toHaveCount(0)

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

    // As item CLEANING it lives on the item page and can never notify, so the
    // review offers no reminder switch for it — it says why instead (HH-161,
    // "a bell is never drawn that cannot be rung").
    await expect(page.getByRole("checkbox", { name: /Remind me when it/ })).toHaveCount(0)
    await expect(page.getByText(/Cleaning lives on the item page — it never notifies you/)).toBeVisible()

    // Refile it as Maintenance: now it goes into Tasks, and the summary's
    // count follows the row (the number the Tasks page will list).
    await page.getByRole("button", { name: /Maintenance keeps it working/ }).click()

    // The cadence editor moved here from the deleted second screen; prove it
    // still works, since losing it was the near-miss of this change.
    await page.getByRole("button", { name: /^Quarterly$/ }).filter({ visible: true }).first().click()

    // Turning the reminder on is the other half — a Recommended task can get a
    // bell without being inflated to Essential.
    const remind = page.getByRole("checkbox", { name: /Remind me when it/ })
    await expect(remind).not.toBeChecked()
    await remind.check()

    await page.getByRole("button", { name: /^Done$/ }).click()
    await expect(page.getByText("1 will show up in Tasks").first()).toBeVisible()

    // One button now, and it is the only thing that writes.
    const save = page.getByRole("button", { name: /^Save/ }).last()
    await expect(save).toBeVisible()
    await save.click()

    // WAIT FOR THE SHEET, not for the row panel. The old assertion here watched
    // "What is it?" — a label inside the EXPANDED ROW, which the row's own Done
    // button collapsed two lines earlier. It was already true before Save was
    // clicked, so it observed nothing about saving at all, and a reload placed
    // after it raced the in-flight commit and killed it.
    //
    // The dialog closing is the real signal: ReviewItemTasksButton only calls
    // setOpen(false) after saveItemTaskReview resolves without an error.
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 })

    // Reload so nothing in memory can answer for Firestore, then reopen the
    // review and read both edits back off the row that wrote them.
    await page.reload()
    await expect(page.getByText("Bosch 800 Series Dishwasher").filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /^Review tasks$/ }).filter({ visible: true }).first().click()
    // Headless Chromium has refused notifications, so this row — now reminding
    // — says "Reminders off" under its title (HH-161 S5.2). It is a status,
    // not a link: the row is the button that opens it, and a link inside it
    // used to catch a tap at the row's centre and leave the review for
    // Settings (owner, #228 review). So the centre is where this taps.
    const row = page.getByRole("button", { name: /Descale the dishwasher/ }).first()
    await expect(row).toContainText("Reminders off", { timeout: 10_000 })
    await expect(row.getByRole("link")).toHaveCount(0)
    await row.click()
    await expect(page.getByText("How often?")).toBeVisible({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe("/items/dishwasher")

    // Cleaning → Maintenance and Monthly → Quarterly survived the round trip...
    await expect(page.getByRole("button", { name: /Maintenance keeps it working/ })).toHaveAttribute("aria-pressed", "true")
    await expect(
      page.getByRole("button", { name: /^Quarterly$/ }).filter({ visible: true }).first()
    ).toHaveAttribute("aria-pressed", "true")

    // ...and so did the bell, which is stored separately from the tier.
    await expect(page.getByRole("checkbox", { name: /Remind me when it/ })).toBeChecked()

    // Put the seed's kind back. Later specs in this run share the emulator,
    // and as Maintenance this row would join the Tasks agenda they count.
    await page.getByRole("button", { name: /Cleaning keeps it nice/ }).click()
    await page.getByRole("button", { name: /^Done$/ }).click()
    await page.getByRole("button", { name: /^Save/ }).last().click()
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 })
  })
})
