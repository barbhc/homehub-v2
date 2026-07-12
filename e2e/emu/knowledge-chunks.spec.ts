import { test, expect } from "@playwright/test"

/**
 * Knowledge chunks against the seeded emulator — proves knowledgeService's chunk
 * reads (getKnowledgeChunksByHome, and getChunksByItem underneath) traverse the
 * nested homes/{homeId}/manuals/{manualId}/chunks path end-to-end. The seed
 * attaches a parsed furnace manual with a "how_to" chunk.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — knowledge chunks", () => {
  test("the Ask/knowledge page surfaces a seeded manual chunk", async ({ page }) => {
    await page.goto("/faq")
    // getKnowledgeChunksByHome → the furnace group shows its chunk counts
    // ("Care 1 How To 1"), which alone proves both seeded chunks were read.
    const group = page.getByRole("button", { name: /Carrier Infinity Furnace.*How To 1/ }).filter(visible).first()
    await expect(group).toBeVisible({ timeout: 20_000 })
    // Expand the group, then select the "How To" sub-tab and confirm the how_to
    // chunk's title renders (getChunksByItem traversed the nested chunk path).
    await group.click()
    await page.getByRole("button", { name: /^How To 1/ }).filter(visible).first().click()
    await expect(
      page.getByText("Replacing the furnace filter").filter(visible).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})
