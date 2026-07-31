import { test, expect } from "@playwright/test"

/** The review wizard, driven end-to-end on the seeded emulator. */
test.describe("emulator e2e — task review wizard", () => {
  test("reviews an existing item's tasks and writes the result back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/dishwasher")
    await expect(page.getByText("Bosch 800 Series Dishwasher").filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })

    // The entry point that lets EXISTING tasks reach the wizard at all.
    const entry = page.getByText("Review these tasks").filter({ visible: true }).first()
    await expect(entry).toBeVisible({ timeout: 10_000 })
    await entry.click()

    // Lead-in must name both routes, and never offer a dead "Skip".
    await expect(page.getByText(/worth tracking/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/take them one at a time/)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Skip$/ })).toHaveCount(0)

    // Sections state their consequence.
    await expect(page.getByText("We'll remind you when these come due.")).toBeVisible()

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
