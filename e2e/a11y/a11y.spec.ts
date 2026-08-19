import { test, expect, gotoStable } from "../fixtures"
import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

/**
 * Accessibility scan of every surface, at both viewports.
 *
 * FAILS the run on any WCAG 2.1/2.2 A or AA violation of `critical` or
 * `serious` impact. It used to report and pass — `A11Y_BLOCKING = false` with a
 * note to "flip it once the violations are worked down". Nobody flips a flag
 * like that, because nothing ever forces the day. It also matched no config any
 * pipeline ran, so it reported into a log nobody read.
 *
 * Both of those are fixed: this spec now has its own emulator-backed config
 * (playwright.a11y.config.ts) wired into CI, and it gates.
 *
 * `wcag22aa` is included specifically for `target-size`. Tap targets that were
 * too small cost v1 five separate fix commits inside 48 hours — found one at a
 * time, by a human, on a phone. That rule is the whole reason this suite runs
 * at the mobile viewport too.
 */

type PageCase = { name: string; path: string; ready: RegExp }

const PAGES: PageCase[] = [
  { name: "home", path: "/home", ready: /good (morning|afternoon|evening)|today|this week/i },
  { name: "tasks", path: "/maintenance", ready: /Replace HVAC furnace filter/i },
  { name: "items", path: "/inventory", ready: /Bosch 800 Series Dishwasher/i },
  { name: "ask", path: "/chat", ready: /ask|help|question/i },
  { name: "warranties", path: "/warranties", ready: /Bosch|coverage/i },
  { name: "clean", path: "/clean", ready: /start cleaning|cleaning guides/i },
  { name: "providers", path: "/providers", ready: /Ace Heating & Air/i },
  { name: "settings", path: "/settings", ready: /settings|appearance|account/i },
]

/**
 * WCAG A/AA across 2.0, 2.1 and 2.2. Best-practice rules are deliberately NOT
 * included: they are opinions (region landmarks, heading order) and gating on
 * an opinion is how a suite gets muted.
 */
async function scan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
}

for (const p of PAGES) {
  test(`${p.name} has no critical/serious a11y violations`, async ({ page }) => {
    await gotoStable(page, p.path)
    // Filter to visible matches: the responsive layout keeps hidden
    // desktop/mobile variants in the DOM, so `.first()` can resolve to a hidden
    // element and wait forever on something that will never be visible.
    await page.getByText(p.ready).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 20_000 })

    const results = await scan(page)
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    )

    if (blocking.length) {
      // Printed before the assertion so the failure message in CI names the
      // element, not just the rule. "color-contrast (serious) [3]" sends you
      // hunting; the selector and the failure summary do not.
      const detail = blocking
        .map((v) => {
          const nodes = v.nodes
            .slice(0, 5)
            .map((n) => `        ${n.target.join(" ")}\n          ${(n.failureSummary ?? "").split("\n").join("\n          ")}`)
            .join("\n")
          const more = v.nodes.length > 5 ? `\n        …and ${v.nodes.length - 5} more` : ""
          return `  • ${v.id} (${v.impact}) — ${v.help}\n    ${v.helpUrl}\n${nodes}${more}`
        })
        .join("\n\n")
      console.log(`\n[a11y:${p.name}] ${blocking.length} critical/serious violation(s):\n${detail}\n`)
    }

    expect(
      blocking.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`),
      `critical/serious WCAG A/AA violations on ${p.name} — see the console output above for the offending selectors`,
    ).toEqual([])
  })
}
