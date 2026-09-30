import { test, expect } from "@playwright/test"

/**
 * HH-143 — the hand-off card must never squeeze its sentence into a column
 * narrower than the button beside it.
 *
 * Measured on the live component 2026-08-31, BEFORE the fix: one
 * `items-center` row gave the text 92px at a 375pt viewport — narrower than
 * the 133px button beside it — so a one-sentence notice wrapped to 14 lines and
 * stood 286px tall, with the tick and button floating against the middle of the
 * column. The owner reported it from a 430pt phone, which was the BEST case
 * (147px, 8 lines).
 *
 * The fix stacks the action row under the text until the CARD (container
 * query, not viewport — the card sits in narrower parents) reaches 30rem. The
 * threshold is measured, not picked: at card ≥ 480px the shared row still
 * leaves the sentence ~317px, two lines at most.
 *
 * HH-161: this was round 14's no-maintenance card ("We finished reading the…
 * See what we found"), which is gone. The seeded microwave — read, nothing
 * saved — now shows the ONE hand-off card ("We read the … manual" + "Review
 * …"), and it lives INSIDE the item's tree, between the name and Upkeep: so at
 * 768pt, where the page is still the phone layout (one tree, `lg` is 1024), the
 * card is phone-width and stacks; the desktop tree gives it a wide row.
 *
 * Guard shape follows desktop-gap.spec.ts: real page, seeded emulator, both
 * regimes pinned so neither the stack nor the row can silently regress.
 */

async function measure(page: import("@playwright/test").Page) {
  const card = page.getByTestId("handoff-card")
  await expect(card).toHaveCount(1, { timeout: 15_000 })
  const title = card.getByText(/^We read the .+ manual$/)
  await expect(title).toBeVisible()
  return title.evaluate((t) => {
    const cardEl = t.closest('[data-testid="handoff-card"]') as HTMLElement
    const btn = cardEl.querySelector("button")!
    const lh = parseFloat(getComputedStyle(t as HTMLElement).lineHeight)
    const bb = btn.getBoundingClientRect()
    const tb = t.getBoundingClientRect()
    return {
      buttonText: btn.textContent ?? "",
      textW: Math.round(tb.width),
      buttonW: Math.round(bb.width),
      titleLines: Math.round(tb.height / lh),
      cardH: Math.round(cardEl.getBoundingClientRect().height),
      stacked: bb.top >= tb.bottom,
    }
  })
}

test.describe("hand-off card fits (HH-143, HH-161)", () => {
  for (const w of [375, 430, 768]) {
    test(`phone layout (${w}pt): action stacks below the sentence`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 932 })
      await page.goto("/items/microwave")
      const m = await measure(page)
      expect(m.buttonText).toMatch(/^Review \d+ /)
      expect(m.stacked, "button must sit below the text, not beside it").toBe(true)
      // The regression this pins: 92px text beside a 133px button.
      expect(m.textW, "the sentence gets more room than the button").toBeGreaterThan(m.buttonW)
      expect(m.titleLines, "title wraps to at most 3 lines").toBeLessThanOrEqual(3)
      expect(m.cardH, "the card stays a card, not a panel").toBeLessThanOrEqual(200)
    })
  }
  test("desktop layout (1440pt): one row, as before", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 932 })
    await page.goto("/items/microwave")
    const m = await measure(page)
    expect(m.stacked, "wide cards keep the original single row").toBe(false)
    expect(m.cardH).toBeLessThanOrEqual(110)
  })
})
