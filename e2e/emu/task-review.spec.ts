import { test, expect } from "@playwright/test"

/** The review wizard, driven end-to-end on the seeded emulator. */
test.describe("emulator e2e — task review wizard", () => {
  test("reviews an existing item's tasks and writes the result back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/dishwasher")
    await expect(page.getByText("Bosch 800 Series Dishwasher").filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })

    // The entry point that lets EXISTING tasks reach the wizard at all.
    // ItemDetailPage passes `compact`, which renders the short "Review tasks"
    // button in the Upkeep heading rather than the full "Review these tasks"
    // card — the entry point moved into the heading "where the decision it
    // changes actually lives". Both strings still exist in the component; only
    // the compact one is reachable from this page.
    const entry = page.getByRole("button", { name: /^Review tasks$/ }).filter({ visible: true }).first()
    await expect(entry).toBeVisible({ timeout: 10_000 })
    await entry.click()

    // Round 12 (HH-119): `focus` now DEFAULTS to "maintenance", so every door
    // opens the consolidated review and the full step-1 wizard is the thing you
    // opt into. This test is about the full wizard writing back correctly, so
    // it takes the route a user now takes to reach it.
    //
    // The seeded dishwasher's only task is cleaning, so the consolidated view
    // reports that nothing needs a reminder and offers "Review them all".
    await expect(page.getByText(/Nothing here needs a reminder|Keep an eye on/i).first())
      .toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /Review them all|Review everything/ }).first().click()

    // Lead-in must name both routes, and never offer a dead "Skip".
    await expect(page.getByText(/worth tracking/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/take them one at a time/)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Skip$/ })).toHaveCount(0)

    // Sections state their consequence. The wording lives in
    // shared/tasks/reviewBuckets.ts (REVIEW_BUCKET_COPY) and was rewritten
    // there; asserting the current sentence rather than a remembered one.
    await expect(
      page.getByText("On your schedule, with a reminder when each comes due.").first(),
    ).toBeVisible()

    // Open a task; the roomy card must offer type AND priority.
    await page.getByRole("button", { name: /Descale the dishwasher/ }).first().click()
    await expect(page.getByText("What is it?")).toBeVisible()
    await expect(page.getByText("How important?")).toBeVisible()

    // Change priority, then save.
    await page.getByRole("button", { name: /Essential/ }).filter({ visible: true }).first().click()
    await page.getByRole("button", { name: /^Done$/ }).click()

    const cta = page.getByRole("button", { name: /Next: schedule|^Save \d+ task/ }).last()
    await expect(cta).toBeVisible()
    await cta.click()
    const save = page.getByRole("button", { name: /^Save \d+ task/ }).last()
    if (await save.isVisible().catch(() => false)) await save.click()

    // Sheet closes → the write landed without an error surfacing.
    await expect(page.getByText("What is it?")).toHaveCount(0, { timeout: 15_000 })
  })
})
