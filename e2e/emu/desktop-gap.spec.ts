import { test, expect } from "@playwright/test"

/**
 * The scan card must USE the width it is given, at every width.
 *
 * The bug this pins: at 1440 the card was 526px holding 205px of content —
 * identical to what it held at 375 — so doubling the viewport bought nothing
 * but a 265px void before the chevron. The owner read it as a layout bug,
 * correctly.
 *
 * The first attempt asserted the GAP stayed small, which was the wrong
 * invariant: it described one symptom of the old layout and would have been
 * satisfied by simply moving the void behind the chevron (which is exactly
 * what the first fix did, and it looked worse). What actually matters is the
 * proportion of the card its content occupies — that is the difference between
 * a row that responds to its container and one that is merely stretched.
 */
for (const w of [375, 390, 430, 600, 752, 1440]) {
  test(`scan card uses its width at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()
    const scan = page.getByRole("button", { name: /Scan the label/ }).first()
    await scan.waitFor({ timeout: 15_000 })
    const g = await scan.evaluate((btn) => {
      const card = btn.getBoundingClientRect()
      const kids = [...btn.children]
      const left = kids[0].getBoundingClientRect()
      const chev = kids[kids.length - 1].getBoundingClientRect()
      const cs = getComputedStyle(btn)
      const inner = card.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      return {
        card: Math.round(card.width),
        content: Math.round(left.width + chev.width),
        fill: Math.round(((left.width + chev.width) / inner) * 100),
        lines: Math.round(left.height / 20),
      }
    })
    console.log(`[${w}] card=${g.card}px content=${g.content}px fills ${g.fill}% of the inner width`)
    expect(g.fill, `card is ${100 - g.fill}% empty at ${w} — the width is not buying content`).toBeGreaterThan(55)
  })
}
