import { test, expect } from "@playwright/test"

/**
 * HH-143 — the parse-finished notice must never squeeze its sentence into a
 * column narrower than the button beside it.
 *
 * Measured on the live component 2026-08-31, BEFORE the fix: one
 * `items-center` row gave the text 92px at a 375pt viewport — narrower than
 * the 133px "See what we found" button beside it — so a one-sentence notice
 * wrapped to 14 lines and stood 286px tall, with the tick and button floating
 * against the middle of the column. The owner reported it from a 430pt phone,
 * which was the BEST case (147px, 8 lines).
 *
 * The fix stacks the action row under the text until the CARD (container
 * query, not viewport — the notice also lives in narrower parents) reaches
 * 30rem. The threshold is measured, not picked: at card ≥ 480px the shared
 * row still leaves the sentence ~317px, two lines at most.
 *
 * Guard shape follows desktop-gap.spec.ts: real page, seeded emulator, both
 * regimes pinned so neither the stack nor the row can silently regress.
 */

async function measure(page: import("@playwright/test").Page) {
  const title = page.getByText(/We finished reading the/).first()
  await expect(title).toBeVisible({ timeout: 10_000 })
  return title.evaluate((t) => {
    const card = t.closest("div.mb-4") as HTMLElement
    const btn = card.querySelector("button.inline-flex")
    const lh = parseFloat(getComputedStyle(t as HTMLElement).lineHeight)
    const bb = btn!.getBoundingClientRect()
    const tb = t.getBoundingClientRect()
    return {
      textW: Math.round(t.parentElement!.getBoundingClientRect().width),
      buttonW: Math.round(bb.width),
      titleLines: Math.round(tb.height / lh),
      cardH: Math.round(card.getBoundingClientRect().height),
      stacked: bb.top >= tb.bottom,
    }
  })
}

test.describe("parse-pickup notice fits (HH-143)", () => {
  for (const w of [375, 430]) {
    test(`phones (${w}pt): action stacks below the sentence`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 932 })
      await page.goto("/items/microwave")
      const m = await measure(page)
      expect(m.stacked, "button must sit below the text, not beside it").toBe(true)
      // The regression this pins: 92px text beside a 133px button.
      expect(m.textW, "the sentence gets more room than the button").toBeGreaterThan(m.buttonW)
      expect(m.titleLines, "title wraps to at most 3 lines").toBeLessThanOrEqual(3)
      expect(m.cardH, "the notice stays a notice, not a panel").toBeLessThanOrEqual(200)
    })
  }
  for (const w of [768, 1440]) {
    test(`wide (${w}pt): one row, as before`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 932 })
      await page.goto("/items/microwave")
      const m = await measure(page)
      expect(m.stacked, "wide cards keep the original single row").toBe(false)
      expect(m.cardH).toBeLessThanOrEqual(110)
    })
  }
})
