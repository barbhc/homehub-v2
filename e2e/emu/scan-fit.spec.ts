import { test, expect } from "@playwright/test"

/**
 * The scan control's two sub-lines must each hold ONE line beside the icon tile,
 * on the narrowest phone we support.
 *
 * This exists because the mockup lied. Its phone is 358px of content at 11px
 * type, which fits noticeably more characters than a real 375pt screen at 12px —
 * so copy that looked comfortable in the mockup wrapped on the device the owner
 * and every tester actually holds. The text column here is ~165px; that is the
 * budget, and it is small.
 */
for (const [label, width] of [["375 (iPhone SE / 8 / 13 mini)", 375], ["390 (iPhone 15/16)", 390], ["430 (15 Pro Max)", 430]] as const) {
  test(`scan control holds one line per sentence at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()

    const scan = page.getByRole("button", { name: /Scan the label/ }).first()
    await expect(scan).toBeVisible({ timeout: 15_000 })

    const measured = await scan.evaluate((btn) =>
      ([...btn.querySelectorAll("span.text-xs")] as HTMLElement[]).map((e) => {
        const cs = getComputedStyle(e)
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
        return { text: (e.textContent ?? "").trim(), lines: Math.round(e.getBoundingClientRect().height / lh) }
      }),
    )

    console.log(`[${width}px] ` + measured.map((m) => `${m.lines}L "${m.text}"`).join("  |  "))
    // If this drops to zero the selector stopped matching and the loop below
    // would pass having asserted nothing.
    expect(measured.length).toBe(2)
    for (const m of measured) {
      expect(m.lines, `"${m.text}" wrapped to ${m.lines} lines at ${width}px`).toBe(1)
    }
  })
}
