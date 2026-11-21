import { test, expect } from "@playwright/test"

/**
 * Home, next (design/home-next.md, owner 2026-11-21) on the seeded emulator:
 * ONE task as the task card, "N more this week" to Tasks, then only what Tasks
 * can't show — Heads up, Coming up, In a pinch — and the old week list gone.
 *
 * Mark done needs the functions emulator (completeTask is a callable), so the
 * "task leaves" half rides on Snooze, a pure Firestore write with a visible
 * Undo — the same choice the journey walk makes.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — Home: Next up and what Tasks can't show", () => {
  test("one task card, then Heads up, Coming up and In a pinch, in that order; no week list", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/home")
    const card = page.getByTestId("next-up-card").filter(visible)
    await expect(card).toBeVisible({ timeout: 20_000 })

    // The seed's lapsed essential leads, as the task card.
    await expect(card.getByTestId("next-up-title")).toHaveText("Replace HVAC furnace filter")
    await expect(card.getByTestId("task-status")).toContainText("Essential")
    await expect(card.getByRole("button", { name: "Mark done" })).toBeVisible()
    await expect(card.getByRole("button", { name: "Snooze" })).toBeVisible()
    await expect(card.getByRole("link", { name: "Open Replace HVAC furnace filter" })).toHaveAttribute("href", /\/tasks\//)
    await expect(page.getByRole("link", { name: /more this week/ }).filter(visible)).toHaveAttribute("href", "/maintenance")

    // The week list is gone from Home: not rendered (it lives in Tasks).
    await expect(page.getByTestId("this-week")).toHaveCount(0)
    await expect(page.getByTestId("week-row")).toHaveCount(0)
    // Only one task's title on Home: the second task is not here.
    await expect(page.getByText("Test smoke & CO detectors", { exact: true }).filter(visible)).toHaveCount(0)

    // Order on the page: Next up, Heads up, Coming up, In a pinch.
    const order = await page.evaluate(() =>
      ["next-up", "heads-up", "coming-up", "in-a-pinch"].map((id) => {
        const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => (e as HTMLElement).offsetParent)
        return el ? Math.round(el.getBoundingClientRect().top) : null
      }))
    expect(order.every((y) => y !== null)).toBe(true)
    expect([...order].sort((a, b) => a! - b!)).toEqual(order)

    // Heads up: the seeded microwave manual waits for review.
    await expect(page.getByTestId("heads-up").filter(visible)).toContainText("A manual is ready to review")
    // In a pinch: the seeded providers fill Your pros; unnoted shutoffs say Add.
    const pinch = page.getByTestId("in-a-pinch").filter(visible)
    await expect(pinch).toContainText("Water shutoff")
    await expect(pinch).toContainText("Your pros")
    await expect(pinch.getByRole("link", { name: /Gas shutoff/ })).toHaveAttribute("href", "/inventory/notes?idea=Gas%20shutoff")

    // Ask is one field: typing and sending opens Ask with the question.
    await page.getByRole("textbox", { name: "Ask about your home" }).filter(visible).fill("Why is my furnace clicking?")
    await page.getByRole("button", { name: "Ask", exact: true }).filter(visible).click()
    await page.waitForURL(/\/chat/, { timeout: 10_000 })
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })

  test("when the task leaves, the next one takes its place", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/home")
    const title = () => page.getByTestId("next-up-title").filter(visible)
    await expect(title()).toBeVisible({ timeout: 20_000 })
    const lead = ((await title().textContent()) ?? "").trim()

    await page.getByTestId("next-up-card").filter(visible).getByRole("button", { name: "Snooze" }).click()
    await expect(title()).not.toHaveText(lead, { timeout: 15_000 })
    // Snooze is reversible, and says so — and this walk puts the seed back the
    // way it found it, because home.spec runs after it on the same emulator.
    const undo = page.getByRole("button", { name: /Undo/ }).filter(visible)
    await expect(undo).toBeVisible({ timeout: 10_000 })
    await undo.click()
    await expect(title()).toHaveText(lead, { timeout: 15_000 })
  })
})
