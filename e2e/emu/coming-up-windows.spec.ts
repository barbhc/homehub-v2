// The shared fixture pins the browser clock to SEED_TODAY: the seed's forward
// offsets (+3 … +12 days) are only "forward" on that calendar. On the real
// clock every seeded task is months lapsed and the drawer has no forward row
// to test — which is exactly the half of the list this spec exists to cover.
import { test, expect } from "../fixtures"

/**
 * Home's "Coming up" drawer speaks ONE vocabulary.
 *
 * The owner, 2026-09-01: its overdue rows said "Good to do now" while its
 * forward rows said "Wed, Sep 2" — for the same kind of task. The forward half
 * came from getUpcomingTasks, whose row type had dropped `scheduleType`, so a
 * stored date was all it could print. A window has no deadline; printing one
 * invents a promise (design/due-windows.md).
 *
 * Asserted over EVERY row the drawer actually shows (it caps at six, so naming
 * tasks would test the cap instead of the copy), and per-row rather than
 * page-wide — the page header legitimately shows today's date. A genuine
 * deadline may still carry one: it reads "By Sep 30", a different shape, kept
 * on purpose.
 */
const visible = { visible: true } as const
const WEEKDAY_DATE = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \w{3} \d{1,2}/
const PHRASE = /Good to do now|Been a while|This week|\w{3}-ish|By \w{3} \d{1,2}|skipped a cycle/

test.describe("emulator e2e — Coming up speaks in windows", () => {
  test("every row shows a window phrase, never a weekday date", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/home")

    const header = page.getByRole("button", { name: /Coming up/ }).filter(visible).first()
    await expect(header).toBeVisible({ timeout: 20_000 })
    await header.click()

    // The drawer is the header button's parent; its other buttons are the rows
    // (each row = a done circle + the body button).
    const drawer = header.locator("xpath=..")
    // Rows are "Mark … done" circles + body buttons; wait for the first body
    // (the forward schedule loads a beat after the hero) before reading.
    const rows = drawer.getByRole("button").filter({ hasNotText: /^Coming up/ }).filter({ hasNotText: /^Mark / })
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const texts = (await rows.allInnerTexts())
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0)
    expect(texts.length, "expected the drawer to list some rows").toBeGreaterThan(0)

    for (const text of texts) {
      expect(text, `a row is still showing a weekday date: ${text}`).not.toMatch(WEEKDAY_DATE)
      expect(text, `a row shows no window phrase at all: ${text}`).toMatch(PHRASE)
    }
  })
})
