import { test, expect } from "@playwright/test"

/**
 * Home, focused (design/home-focus.md) on the seeded emulator: ONE list titled
 * This week, the first task open, any row opening the same way, "All tasks" as
 * the only door out — and when the open task leaves, the new first opens.
 *
 * Mark done needs the functions emulator (completeTask is a callable), so the
 * "task leaves" half rides on Snooze, a pure Firestore write with a visible
 * Undo — the same choice the journey walk makes.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — Home: This week", () => {
  test("first task open on arrival; a tap opens another and closes it; the door is All tasks", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // Mobile + desktop Homes are both in the DOM; only one is visible.
    const section = () => page.getByTestId("this-week").filter(visible)
    const rows = () => section().getByTestId("week-row")

    await page.goto("/home")
    await expect(section()).toBeVisible({ timeout: 20_000 })
    await expect(section().getByText("This week", { exact: true })).toBeVisible()

    // The seed's lapsed essential leads, and it is open.
    const first = rows().first()
    await expect(first).toHaveAttribute("data-open", "true")
    await expect(first).toContainText("Replace HVAC furnace filter")
    await expect(first.getByRole("button", { name: "Mark done" })).toBeVisible()
    await expect(first.getByRole("link", { name: /See details/ })).toHaveAttribute("href", /\/tasks\//)

    // Nothing the old Home carried survives: no stat band, no drawer, no strip.
    await expect(page.getByText(/in their window|Coming up|Full calendar view|across your home/)).toHaveCount(0)

    // Any row opens the same way, and the first closes.
    const second = rows().nth(1)
    await expect(second).toHaveAttribute("data-open", "false")
    await second.getByRole("button", { expanded: false }).click()
    await expect(second).toHaveAttribute("data-open", "true")
    await expect(first).toHaveAttribute("data-open", "false")
    await expect(second.getByRole("button", { name: "Mark done" })).toBeVisible()

    // One door out, and it says where it goes.
    await expect(section().getByRole("link", { name: /All tasks/ })).toHaveAttribute("href", "/maintenance")

    // No task is listed twice on the page.
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toHaveCount(1)
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })

  test("when the open task leaves, the new first opens in its place", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const section = () => page.getByTestId("this-week").filter(visible)
    const rows = () => section().getByTestId("week-row")

    await page.goto("/home")
    await expect(section()).toBeVisible({ timeout: 20_000 })
    const before = await rows().count()
    expect(before).toBeGreaterThan(1)
    const leadTitle = (await rows().first().locator("span.truncate").first().textContent())?.trim() ?? ""

    await rows().first().getByRole("button", { name: /Snooze/ }).click()
    await expect(rows()).toHaveCount(before - 1, { timeout: 15_000 })
    await expect(rows().first()).toHaveAttribute("data-open", "true")
    await expect(rows().first()).not.toContainText(leadTitle)
    // Snooze is reversible, and says so.
    await expect(page.getByRole("button", { name: /Undo/ }).filter(visible)).toBeVisible({ timeout: 10_000 })
  })
})
