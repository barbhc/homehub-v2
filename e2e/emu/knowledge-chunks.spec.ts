import { test, expect } from "@playwright/test"

/**
 * Knowledge chunks against the seeded emulator — proves knowledgeService's chunk
 * read for an item (getChunksByItem) traverses the nested
 * homes/{homeId}/manuals/{manualId}/chunks path end-to-end. The seed attaches a
 * parsed furnace manual with a "how_to" chunk ("Replacing the furnace filter")
 * and a "care" chunk.
 *
 * This walk used to open the Care Guide page (/faq). That page was URL-only on
 * a retired design and is deleted (audit 2026-09-29, D5); the item page is
 * where a manual's guides are read, so the same chunk is asserted there.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — knowledge chunks", () => {
  test("the item page's Guides tab surfaces a seeded manual chunk", async ({ page }) => {
    await page.goto("/items/furnace")
    await expect(page.getByRole("heading", { name: "Carrier Infinity Furnace" }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    // The tab carries the count, and only exists when there is a guide — so a
    // "Guides 1" tab alone proves getChunksByItem returned the seeded how_to chunk.
    const guides = page.getByRole("button", { name: /^Guides\s*1$/ }).filter(visible).first()
    await expect(guides).toBeVisible({ timeout: 10_000 })
    await guides.click()
    await expect(page.getByText("Replacing the furnace filter").filter(visible).first()).toBeVisible({ timeout: 10_000 })
  })
})
