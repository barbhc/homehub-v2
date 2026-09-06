import { test, expect } from "../fixtures"

/**
 * The care library — what an item or a home typically needs, offered where
 * the manual left a gap (design/care-library.md). Owner, 2026-09-06.
 *
 * Three surfaces, one walk each, against the seeded emulator home:
 *  - the item page's Suggested band: Add turns a suggestion into a task that
 *    carries its provenance, and "Not this one" on that task takes it back;
 *  - Your home (/home-setup): answers save as facts and unlock whole-home
 *    care, and a failed-nothing path is never shown as "nothing to set up";
 *  - the Tasks page's standing Suggested group sits LAST and never changes
 *    the groups above it.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — care library", () => {
  test("item page: a suggestion becomes a task with visible provenance, and can be taken back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // The seed's dishwasher has parsed tasks but no drain-filter task, so the
    // library has exactly that to offer. The band opens by itself.
    await page.goto("/items/dishwasher")
    await expect(page.getByText("Suggested", { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    const add = page.getByRole("button", { name: /^Add Clean the dishwasher filter/ }).filter(visible).first()
    await expect(add).toBeVisible()
    await add.click()

    // The task now lives in its band, and says where it came from.
    const row = page.getByTestId("care-row").filter({ hasText: "Clean the dishwasher filter" }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row).toContainText("Added from typical care")
    // No second offer for the same care.
    await expect(page.getByRole("button", { name: /^Add Clean the dishwasher filter/ })).toHaveCount(0)

    // The way back is one tap, on the row itself.
    await row.getByRole("button", { name: "Not this one" }).click()
    await expect(page.getByTestId("care-row").filter({ hasText: "Clean the dishwasher filter" })).toHaveCount(0, { timeout: 20_000 })
  })

  test("Your home: answers save as facts and unlock whole-home care", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/home-setup")
    await expect(page.getByRole("heading", { name: "Your home" })).toBeVisible({ timeout: 20_000 })
    // Nothing answered → nothing offered, and the page says why.
    await expect(page.getByTestId("home-suggestions")).toContainText(/Answer a category/)

    await page.getByRole("button", { name: /^Safety/ }).click()
    await expect(page.getByRole("heading", { name: "Safety" })).toBeVisible()
    const yes = page.getByRole("radio", { name: "Yes" })
    await yes.nth(0).click()
    await yes.nth(1).click()
    await page.getByRole("button", { name: "Save answers" }).click()

    await expect(page.getByText("Answered").first()).toBeVisible({ timeout: 20_000 })
    // The seed already has "Test smoke & CO detectors" — the library matches
    // it and offers only what is missing. That absence is the rule.
    const suggestions = page.getByTestId("home-suggestions")
    await expect(suggestions).toContainText("Check the fire extinguisher")
    await expect(suggestions).toContainText("Replace alarm batteries")
    await expect(suggestions).not.toContainText("Test smoke and CO alarms")

    // Facts persist: a reload reads them back from the home, not from memory.
    await page.reload()
    await expect(page.getByText("Answered").first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole("button", { name: /^Add Check the fire extinguisher/ }).click()
    await expect(page.getByRole("button", { name: /^Add Check the fire extinguisher/ })).toHaveCount(0, { timeout: 20_000 })

    // …and it is a real task now, on the full Tasks list with everything else.
    await page.goto("/tasks")
    await expect(page.getByText("Check the fire extinguisher").first()).toBeVisible({ timeout: 20_000 })
  })

  test("Tasks page: the Suggested group is last and leaves the existing groups alone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // The grouped week (/maintenance): the group is LAST, after every existing group.
    await page.goto("/maintenance")
    // Both layouts are in the DOM; only the one for this viewport is visible.
    const group = page.getByTestId("suggested-group").filter(visible).first()
    await expect(group).toBeVisible({ timeout: 20_000 })
    await expect(group).toContainText(/typical for your home/)
    // Rows name the item they belong to — the reminders-list gap, closed here too.
    await expect(group).toContainText("Bosch 800 Series Dishwasher")
    const groupTop = await group.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    const existingHeaders = page.locator("main").getByText(/^(Essential|Recommended|Optional|Overdue|This week|Later|Whenever)$/)
    for (const h of await existingHeaders.all()) {
      const top = await h.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
      expect(top, "an existing group renders below Suggested").toBeLessThan(groupTop)
    }

    // The full list (/tasks) carries the same group, and its count is not the tasks count.
    await page.goto("/tasks")
    const full = page.getByTestId("suggested-group").filter(visible).first()
    await expect(full).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible()
    await expect(full).toContainText("Clean the dishwasher filter")
  })
})
