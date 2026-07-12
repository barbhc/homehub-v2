import { test, expect } from "@playwright/test"

/**
 * knowledge FAQ subset against the seeded emulator — proves
 * knowledgeService.getFaqsByItem reads the seeded chatFaqs docs from Firestore
 * end-to-end. The seed attaches one saved Q&A to the furnace (item id "furnace").
 *
 * The item-detail page's other loaders (chunks/manuals) are still on the inert
 * shim, so they render empty rather than crashing — the Saved Q&A section is the
 * live-data surface under test.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — knowledge (FAQ subset)", () => {
  test("Saved Q&A renders the seeded item-scoped FAQ (getFaqsByItem end-to-end)", async ({ page }) => {
    await page.goto("/items/furnace")
    // The item loads (getItemUnit) — anchors the page before we assert the FAQ.
    await expect(page.getByText("Carrier Infinity Furnace").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // The "Saved answers" accordion trigger carries the count — 1 proves
    // getFaqsByItem returned the seeded furnace-scoped FAQ. Expand it to reveal
    // the question text.
    const trigger = page.getByRole("button", { name: /Saved answers 1/ }).filter(visible).first()
    await expect(trigger).toBeVisible({ timeout: 10_000 })
    await trigger.click()
    await expect(
      page.getByText(/What furnace filter size do I need/i).filter(visible).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})
