import { test, expect } from "@playwright/test"

/**
 * The part inside its task, end to end on the seeded emulator: add a part to
 * the furnace filter task, give it a link, turn buy-ahead on — and both
 * survive a reload (the transactional writers, not local state). Then the
 * part shows up under "Buy first" on /week, because the seeded furnace task
 * is due this week.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — supplies inside the task", () => {
  test("add a part, link it, turn buy-ahead on; it persists and reaches Buy first", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/items/furnace")
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // Open the task's how-to; the part block lives with the task.
    const row = page.getByText("Replace HVAC furnace filter").filter(visible).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()

    await page.getByRole("button", { name: "Add a part" }).filter(visible).first().click()
    await page.getByLabel("Part name").fill("Furnace filter")
    await page.getByLabel("Part link").fill("https://www.filterbuy.com/16x25x1")
    await page.getByLabel("Part size").fill("16x25x1")
    await page.getByRole("button", { name: "Save part" }).click()

    await expect(page.getByRole("link", { name: /^Buy/ }).filter(visible).first()).toHaveAttribute("href", "https://www.filterbuy.com/16x25x1")
    await expect(page.getByLabel("Remind me to buy the next Furnace filter")).toBeChecked()

    // Reload: the screen must be reading Firestore, not remembering a click.
    await page.reload()
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()
    await expect(page.getByText(/16x25x1 · filterbuy.com/).filter(visible).first()).toBeVisible()
    await expect(page.getByLabel("Remind me to buy the next Furnace filter")).toBeChecked()

    // The seeded furnace task is due this week → the part is a Buy-first row.
    await page.goto("/week")
    await expect(page.getByText("Buy first").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Furnace filter · 16x25x1").filter(visible).first()).toBeVisible()
  })

  test("the task page's You'll need is the same editor: rename the part with specifics, and the item page agrees", async ({ page }) => {
    // Owner, 2026-09-08: the parsed name is the manual's generic phrase; she
    // rewrites it with the exact part here. Self-contained: adds its own part
    // (with a link and size, the state the item-page walk leaves) first.
    await page.goto("/items/furnace")
    await page.getByRole("button", { name: /See how/ }).filter(visible).first().click()
    await page.getByRole("button", { name: /Open task/ }).filter(visible).first().click()
    await page.waitForURL(/\/tasks\//, { timeout: 15_000 })
    const block = page.getByTestId("task-supplies").filter(visible).first()
    await expect(block).toBeVisible({ timeout: 15_000 })
    // The walk above may already have added the part on this seed; add it
    // here only when it is missing, so this test also stands on its own.
    if ((await block.getByText("Furnace filter").count()) === 0) {
      await block.getByRole("button", { name: /Add (a|another) part/ }).click()
      await block.getByLabel("Part name").fill("Furnace filter")
      await block.getByLabel("Part link").fill("https://www.filterbuy.com/16x25x1")
      await block.getByLabel("Part size").fill("16x25x1")
      await block.getByRole("button", { name: "Save part" }).click()
    }
    await expect(block).toContainText("Furnace filter", { timeout: 10_000 })

    await block.getByRole("button", { name: "Edit Furnace filter" }).click()
    await block.getByLabel("Part name for Furnace filter").fill("16x25x1 MERV 8 filter")
    await block.getByRole("button", { name: "Save" }).click()
    // The editor closes only once the write has landed (optimistic text shows
    // sooner) — wait for that before reloading, or the reload races the save.
    await expect(block.getByRole("button", { name: "Save" })).toHaveCount(0, { timeout: 10_000 })
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
})
