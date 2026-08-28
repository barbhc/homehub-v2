import { test, expect } from "@playwright/test"

/**
 * The scan control's two sub-lines must each hold ONE line beside the icon tile,
 * on the narrowest phone we support.
 *
 * This exists because the mockup lied. Its phone is 358px of content at 11px
 * type, which fits noticeably more characters than a real 375pt screen — so
 * copy that looked comfortable in the mockup wrapped on the device the owner
 * and every tester actually holds. The text column here is ~165px; that is the
 * budget, and it is small.
 *
 * It got smaller on 2026-08-27, when these lines went from text-xs to text-sm
 * for legibility. Same 165px, larger type, so the budget tightened by about a
 * fifth and "Point at the model number" stopped fitting — which is how it
 * became "Find the model number", a phrase that fits AND names the harder
 * half of the job.
 */
for (const [label, width] of [["375 (iPhone SE / 8 / 13 mini)", 375], ["390 (iPhone 15/16)", 390], ["430 (15 Pro Max)", 430]] as const) {
  test(`scan control holds one line per sentence at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()

    const scan = page.getByRole("button", { name: /Scan the label/ }).first()
    await expect(scan).toBeVisible({ timeout: 15_000 })

    const measured = await scan.evaluate((btn) =>
      ([...btn.querySelectorAll("[data-scan-line]")] as HTMLElement[]).map((e) => {
        const cs = getComputedStyle(e)
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
        return { text: (e.textContent ?? "").trim(), lines: Math.round(e.getBoundingClientRect().height / lh) }
      }),
    )

    console.log(`[${width}px] ` + measured.map((m) => `${m.lines}L "${m.text}"`).join("  |  "))
    // Anchored on data-scan-line rather than a utility class: the lines were
    // wrapped in a flex container when they learned to sit side by side on wide
    // screens, and a `span.text-sm` selector then matched the WRAPPER instead of
    // the two lines — silently measuring one element and failing this count.
    expect(measured.length).toBe(2)
    for (const m of measured) {
      expect(m.lines, `"${m.text}" wrapped to ${m.lines} lines at ${width}px`).toBe(1)
    }
  })
}
