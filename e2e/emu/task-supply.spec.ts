import { test, expect, type Page } from "@playwright/test"

/**
 * The part inside its task, end to end on the seeded emulator (the part card,
 * design/spares-and-notes.md): add a part, link it, turn buy-ahead on — it all
 * survives a reload (the transactional writers, not local state) and reaches
 * Buy first on /week. Then rename it on the task page, and record where the
 * spare is kept: the place survives a reload and reaches Home's open row (5b).
 */
const visible = { visible: true } as const

/** The furnace filter task's page, with one part on it (added if missing). */
async function furnaceTaskWithPart(page: Page) {
  await page.goto("/items/furnace")
  await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()
  await page.getByRole("button", { name: /Open task/ }).filter(visible).first().click()
  await page.waitForURL(/\/tasks\//, { timeout: 15_000 })
  const block = page.getByTestId("task-supplies").filter(visible).first()
  await expect(block).toBeVisible({ timeout: 15_000 })
  // An earlier walk in this run may already have added it; add it only when
  // missing, so each test also stands on its own.
  if ((await block.getByRole("button", { name: /^Edit / }).count()) === 0) {
    await block.getByRole("button", { name: /Add (a|another) part/ }).click()
    await block.getByLabel("Part", { exact: true }).fill("Furnace filter")
    await block.getByLabel("Store link", { exact: true }).fill("https://www.filterbuy.com/16x25x1")
    await block.getByLabel("Size", { exact: true }).fill("16x25x1")
    await block.getByRole("button", { name: "Save part" }).click()
    await expect(block.getByRole("button", { name: /^Edit / })).toHaveCount(1, { timeout: 10_000 })
  }
  return block
}

test.describe("emulator e2e — the part card", () => {
  test("add a part, link it, turn buy-ahead on; it persists and reaches Buy first", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/furnace")
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // Open the task's how-to; the part card lives with the task.
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()

    await page.getByRole("button", { name: "Add a part" }).filter(visible).first().click()
    await page.getByLabel("Part", { exact: true }).fill("Furnace filter")
    await page.getByLabel("Store link", { exact: true }).fill("https://www.filterbuy.com/16x25x1")
    await page.getByLabel("Size", { exact: true }).fill("16x25x1")
    await page.getByRole("button", { name: "Save part" }).click()

    await expect(page.getByRole("link", { name: "Buy at filterbuy.com" }).filter(visible).first()).toHaveAttribute("href", "https://www.filterbuy.com/16x25x1")
    await expect(page.getByRole("switch", { name: "Remind me to buy the next Furnace filter" })).toBeChecked()

    // Reload: the screen must be reading Firestore, not remembering a click.
    await page.reload()
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()
    await expect(page.getByRole("button", { name: /^Size 16x25x1/ }).filter(visible).first()).toBeVisible()
    await expect(page.getByRole("switch", { name: "Remind me to buy the next Furnace filter" })).toBeChecked()

    // The seeded furnace task is due this week → the part is a Buy-first row.
    await page.goto("/week")
    await expect(page.getByText("Buy first").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Furnace filter · 16x25x1").filter(visible).first()).toBeVisible()
  })

  test("the task page's part card renames the part, and the item page agrees", async ({ page }) => {
    // Owner, 2026-09-08: the parsed name is the manual's generic phrase; she
    // rewrites it with the exact part here, behind the pencil.
    const block = await furnaceTaskWithPart(page)
    const current = (await block.getByRole("button", { name: /^Edit / }).getAttribute("aria-label"))!.replace(/^Edit /, "")

    // exact: the size pill's name ("Size 16x25x1 — edit …") contains this one.
    await block.getByRole("button", { name: `Edit ${current}`, exact: true }).click()
    await block.getByLabel(`Part name for ${current}`).fill("16x25x1 MERV 8 filter")
    await block.getByRole("button", { name: "Save", exact: true }).click()
    // The editor closes only once the write has landed (optimistic text shows
    // sooner) — wait for that before reloading, or the reload races the save.
    await expect(block.getByRole("button", { name: "Save", exact: true })).toHaveCount(0, { timeout: 10_000 })
    await expect(block).toContainText("16x25x1 MERV 8 filter")

    // Persisted — and the item page's row shows the same part. (A beat for
    // the emulator: a reload in the same instant read the pre-write document;
    // with the write proven landed a second later, this is propagation, not
    // a lost save.)
    await page.waitForTimeout(1000)
    await page.reload()
    await expect(page.getByTestId("task-supplies").filter(visible).first()).toContainText("16x25x1 MERV 8 filter", { timeout: 15_000 })
    await page.goto("/items/furnace")
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()
    await expect(page.getByText("16x25x1 MERV 8 filter").filter(visible).first()).toBeVisible({ timeout: 15_000 })
  })

  test("where the spare is kept: one tap to record it; it survives a reload and reaches Home (5b)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const block = await furnaceTaskWithPart(page)
    const part = (await block.getByRole("button", { name: /^Edit / }).getAttribute("aria-label"))!.replace(/^Edit /, "")

    // No place yet → the dashed invitation, not a form.
    await block.getByRole("button", { name: /^(Where do you keep it\?|Kept in )/ }).first().click()
    const field = block.getByLabel(`Where you keep ${part}`)
    await expect(field).toBeFocused()
    await field.fill("Hall closet, top shelf")
    await block.getByRole("button", { name: "Save", exact: true }).click()
    await expect(block.getByRole("button", { name: /^Kept in Hall closet, top shelf/ })).toBeVisible({ timeout: 10_000 })

    await page.waitForTimeout(1000)
    await page.reload()
    await expect(page.getByTestId("task-supplies").filter(visible).first()
      .getByRole("button", { name: /^Kept in Hall closet, top shelf/ })).toBeVisible({ timeout: 15_000 })

    // Home: the furnace row's prep line carries the place as a pill.
    await page.goto("/home")
    const row = page.getByTestId("week-row").filter({ hasText: "Replace HVAC furnace filter" }).filter(visible).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    if ((await row.getAttribute("data-open")) !== "true") {
      await row.getByRole("button", { name: /^Replace HVAC furnace filter/ }).click()
    }
    await expect(row.getByTestId("prep-place")).toHaveText(/Hall closet, top shelf/, { timeout: 15_000 })
  })
})
