import { test, expect } from "@playwright/test"

/**
 * Home feed against the seeded emulator — proves getDashboardTasks reads the
 * denormalized taskInstances end-to-end (Home's one list, design/home-focus.md). Secondary surfaces (warranties/notices/upkeep) are on
 * the inert shim for now, so they render empty rather than crashing the page.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — home feed", () => {
  test("Home renders seeded tasks (getDashboardTasks end-to-end)", async ({ page }) => {
    await page.goto("/home")
    await expect(page).toHaveURL(/\/home/)
    // A seeded essential surfaces in the Home feed (hero or Upcoming).
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    // The page did not crash on the still-shimmed secondary loaders.
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })

  test("the first task is open on arrival, and See details reaches its real detail (getTaskDetail end-to-end)", async ({ page }) => {
    await page.goto("/home")
    // Home, focused: the week's first task opens by default; its "See details"
    // is the one door to the full view.
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    const open = page.locator('[data-testid="week-row"][data-open="true"]').filter(visible).first()
    await expect(open).toBeVisible()
    await open.getByRole("link", { name: /See details/ }).click()
    // The template's justification (why-it-matters) renders only after
    // getTaskDetail resolves the taskInstance → taskTemplate read.
    await expect(
      page.getByText(/clogged filter strains the blower/i).filter(visible)
    ).toBeVisible({ timeout: 10_000 })
  })

  test("a successful dashboard fetch persists a warm-start snapshot", async ({ page }) => {
    // Covers the wiring only: useDashboard's onSuccess writes the snapshot that
    // App feeds back as SWR `fallback`, and a reload still renders. It does NOT
    // prove the warm cache is what painted — against a local emulator the cold
    // fetch is fast enough that a broken gate would still render in time. The
    // gate invariant itself is unit-tested in src/lib/homeLoadingGate.test.ts.
    await page.goto("/home")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })

    const persisted = await page.evaluate(() => localStorage.getItem("hh-swr-dashboard-cache"))
    expect(persisted, "a successful dashboard fetch must persist a snapshot").not.toBeNull()
    expect(persisted).toContain("dashboard:")

    await page.reload()
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Failed to load|Something went wrong/i)).toHaveCount(0)
  })
})
