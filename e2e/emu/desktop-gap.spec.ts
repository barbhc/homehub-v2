import { test, expect } from "@playwright/test"
for (const w of [375, 390, 430, 600, 768, 1440]) {
  test(`scan row at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()
    const scan = page.getByRole("button", { name: /Scan the label/ }).first()
    await scan.waitFor({ timeout: 15_000 })
    const g = await scan.evaluate((btn) => {
      const kids = [...btn.children]
      const left = kids[0].getBoundingClientRect()
      const chev = kids[kids.length - 1].getBoundingClientRect()
      return { card: Math.round(btn.getBoundingClientRect().width), gap: Math.round(chev.left - left.right) }
    })
    const pct = Math.round((g.gap / g.card) * 100)
    console.log(`[${w}] card=${g.card}px  gap=${g.gap}px  (${pct}% of the card)`)
    // Proportional, not absolute: a gap that grows with the card is fine; a gap
    // that grows FASTER than the card is the chevron letting go of its row.
    expect(pct, `chevron drifted ${pct}% of the card width at ${w}`).toBeLessThan(16)
  })
}
