import { test, expect } from "@playwright/test"

/**
 * Notes, end to end on the seeded emulator (design/spares-and-notes.md §2):
 * a house note from the top of Items, a room note from its heading, an item
 * note from the item page — each started by an idea, each surviving a reload.
 * The item walk edits and deletes its own note, leaving the seed as it found it.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — notes", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test("a house note: from the top of Items, started by an idea, survives a reload", async ({ page }) => {
    await page.goto("/inventory")
    await page.getByTestId("house-notes-card").filter(visible).first().click()
    await page.waitForURL(/\/inventory\/notes$/, { timeout: 15_000 })
    await expect(page.getByRole("heading", { name: "House notes" })).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "Water shutoff" }).click()
    const box = page.getByLabel("Note", { exact: true })
    await expect(box).toHaveValue("Water shutoff: ")
    await box.fill("Water shutoff: under the kitchen sink, blue lever")
    await page.getByRole("button", { name: "Save note" }).click()
    await expect(box).toBeHidden({ timeout: 10_000 }) // closed only once the write landed

    const row = page.getByTestId("note-row").filter({ hasText: "under the kitchen sink" })
    await expect(row).toBeVisible()
    await page.waitForTimeout(1000) // emulator propagation before a reload (see task-supply.spec)
    await page.reload()
    await expect(page.getByTestId("note-row").filter({ hasText: "under the kitchen sink" })).toBeVisible({ timeout: 15_000 })

    await page.goto("/inventory")
    await expect(page.getByTestId("house-notes-card").filter(visible).first()).toContainText("Water shutoff", { timeout: 15_000 })
  })

  test("a room note: from the room's heading on Items, and the heading counts it", async ({ page }) => {
    await page.goto("/inventory")
    await page.getByRole("link", { name: /(Add a note|notes?) for Kitchen$/ }).filter(visible).first().click()
    await page.waitForURL(/\/inventory\/rooms\/[^/]+\/notes$/, { timeout: 15_000 })
    await expect(page.getByRole("heading", { name: "Kitchen" })).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "Paint", exact: true }).click()
    await expect(page.getByText("Brand, color name or code, finish — and where the leftover is.")).toBeVisible()
    const box = page.getByLabel("Note", { exact: true })
    await box.fill("Paint: Benjamin Moore Swiss Coffee OC-45, eggshell")
    await page.getByRole("button", { name: "Save note" }).click()
    await expect(box).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId("note-row").filter({ hasText: "Swiss Coffee" })).toBeVisible()

    await page.waitForTimeout(1000)
    await page.goto("/inventory")
    await expect(page.getByRole("link", { name: /\d+ notes? for Kitchen$/ }).filter(visible).first()).toBeVisible({ timeout: 15_000 })
  })

  test("an item note: added, edited and deleted on the item page, each surviving a reload", async ({ page }) => {
    await page.goto("/items/furnace")
    const section = page.getByTestId("item-notes").filter(visible).first()
    await expect(section).toBeVisible({ timeout: 20_000 })

    await section.getByRole("button", { name: "Add a note" }).click()
    const box = page.getByLabel("Note", { exact: true })
    await page.getByRole("button", { name: "How to reach the filter" }).click()
    await box.fill("How to reach the filter: the left panel lifts straight off")
    await page.getByRole("button", { name: "Save note" }).click()
    await expect(box).toBeHidden({ timeout: 10_000 })
    const row = section.getByTestId("note-row").filter({ hasText: "lifts straight off" })
    await expect(row).toBeVisible()

    await page.waitForTimeout(1000)
    await page.reload()
    const rowAgain = page.getByTestId("item-notes").filter(visible).first().getByTestId("note-row").filter({ hasText: "lifts straight off" })
    await expect(rowAgain).toBeVisible({ timeout: 15_000 })

    // Edit it.
    await rowAgain.getByRole("button", { name: "Edit note: How to reach the filter" }).click()
    await box.fill("How to reach the filter: the left panel lifts off — no tools")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(box).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId("item-notes").filter(visible).first()).toContainText("no tools")

    // Delete it — the seed is left as it was found.
    await page.getByTestId("item-notes").filter(visible).first().getByRole("button", { name: "Edit note: How to reach the filter" }).click()
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(box).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId("item-notes").filter(visible).first().getByTestId("note-row").filter({ hasText: "no tools" })).toHaveCount(0)
    await page.waitForTimeout(1000)
    await page.reload()
    await expect(page.getByTestId("item-notes").filter(visible).first()).toContainText("Nothing noted yet", { timeout: 15_000 })
  })
})
