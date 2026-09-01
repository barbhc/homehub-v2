import { test, expect } from "@playwright/test"

/**
 * /reminders against the seeded emulator — the AI-free path (the functions
 * emulator is not part of this stack, so the propose step is unit-tested
 * with a fake tool; everything after it is real here).
 *
 * The seeded "Service AC before summer" is Recommended with remindEnabled
 * null, so /week does not show it in the default mode. Turning it on through
 * the curation flow must make /week show it — the bell visibly ON, end to
 * end — while the task itself never leaves the Tasks page. (Each walk in this
 * suite turns on a DIFFERENT seeded task: they share one emulator per run.)
 */
const visible = { visible: true } as const

test.describe("emulator e2e — your reminders", () => {
  test("pick a task from search, turn it on, and it joins the week", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto("/week")
    await expect(page.getByRole("heading", { name: "Your week" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Service AC before summer")).toHaveCount(0)

    await page.goto("/reminders")
    await expect(page.getByRole("heading", { name: "Your reminders" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: "Skip — pick from your tasks" }).click()
    await page.getByLabel("Search your tasks").fill("service ac")
    await page.getByRole("button", { name: "Add Service AC before summer" }).click()
    await expect(page.getByLabel("Service AC before summer")).toBeChecked()
    await page.getByRole("button", { name: /Turn these on · 1/ }).click()
    await expect(page.getByText("1 reminder on.")).toBeVisible({ timeout: 15_000 })

    await page.goto("/week")
    await expect(page.getByText("Service AC before summer").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // Corpus invariant: the task is still exactly where it always was.
    await page.goto("/maintenance")
    await expect(page.getByText("Service AC before summer").filter(visible).first()).toBeVisible({ timeout: 20_000 })
  })
})
