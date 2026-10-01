import { test, expect } from "@playwright/test"

/**
 * Home, phone width: a check-off the server refuses says so on its row (audit H6).
 *
 * Mark done goes through the completeTask callable. Here it answers 500 — the
 * functions emulator is not part of this stack, and the failure is the point.
 * Before H6 the row rolled back and said nothing, which reads as "my tap didn't
 * register". Nothing is written, so the seed is left as it was found.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — Home: a refused check-off is said", () => {
  test("the row stays, says the check-off failed, and nothing claims it is done (390px)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    let calls = 0
    await page.route("**/completeTask", async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      calls += 1
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { status: "INTERNAL", message: "INTERNAL" } }),
      })
    })

    const section = () => page.getByTestId("this-week").filter(visible)
    const rows = () => section().getByTestId("week-row")
    await page.goto("/home")
    await expect(section()).toBeVisible({ timeout: 20_000 })
    const before = await rows().count()
    const lead = rows().first()
    await expect(lead).toContainText("Replace HVAC furnace filter")

    await lead.getByRole("button", { name: "Mark done" }).click()

    const alert = lead.getByRole("alert")
    await expect(alert).toHaveText("Couldn't mark this done. Check your connection and try again.", { timeout: 15_000 })
    expect(calls).toBe(1)
    // The task is genuinely not done: still listed, still first, no receipt.
    await expect(rows()).toHaveCount(before)
    await expect(rows().first()).toContainText("Replace HVAC furnace filter")
    await expect(page.getByText("Marked done")).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath("home-row-refused-checkoff-390.png") })
  })
})
