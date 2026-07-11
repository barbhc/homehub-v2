import { test, expect, gotoStable } from "../fixtures"

/**
 * Behavioural guards for the desktop-audit fixes. Each test pins a specific bug
 * class from the audit so it can never silently regress:
 *   A. flatten-the-dataset   (Tasks / Item specs / Warranties subtitle)
 *   B. wrong landing / unread (Clean hub / Providers directory)
 *   + Ask's cited-answer view.
 */

const isMobile = (name: string) => name === "mobile"

// The redesign renders desktop + mobile variants in the DOM (toggled by
// `hidden`/`lg:`). `.first()` can resolve to the hidden one, so target visible
// matches explicitly.
const vis = (loc: import("@playwright/test").Locator) => loc.filter({ visible: true }).first()

// These flows assert the DESKTOP redesign audit fixes (data-binding, landing)
// by their desktop text/structure. The mobile app has its own layout and is
// covered by the visual + a11y specs on every page, so scope these guards to
// the desktop (chromium) project.
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Desktop-only behavioral flows; mobile is covered by visual + a11y specs"
  )
})

test.describe("A · flatten-the-dataset", () => {
  test("Tasks shows maintenance + home cleaning, NOT item-scoped cleaning steps", async ({ page }) => {
    await gotoStable(page, "/maintenance")
    // Real maintenance task is present…
    await expect(vis(page.getByText(/Replace HVAC furnace filter/i))).toBeVisible({ timeout: 20_000 })
    // …but item-scoped cleaning sub-steps must be filtered out of the agenda
    // (they belong on the item's cleaning guides). Assert the VISIBLE count is
    // 0 — the page also has a hidden legacy "All Tasks" list whose off-screen
    // DOM would otherwise be counted.
    await expect(page.getByText(/Clean oven door glass/i).filter({ visible: true })).toHaveCount(0)
  })

  test("Item Specs render concise key→value pairs (not manual prose)", async ({ page }) => {
    await gotoStable(page, "/inventory")
    // Exact match → click the item card, not a "Clean the <item>" guide (→/clean).
    await vis(page.getByText("Bosch 800 Series Dishwasher", { exact: true })).click()
    await expect(page).toHaveURL(/\/(items|inventory)\/[0-9a-f-]+/i, { timeout: 15_000 })
    // category_fields → short labelled values
    await expect(vis(page.getByText(/Noise level/i))).toBeVisible({ timeout: 15_000 })
    await expect(vis(page.getByText(/42 dBA/i))).toBeVisible()
  })

  test("Warranties subtitle is brand · room with a real coverage end date", async ({ page }) => {
    await gotoStable(page, "/warranties")
    await expect(vis(page.getByText(/Bosch · Kitchen/i))).toBeVisible({ timeout: 20_000 })
    // Status hint + real coverage end date: "Covered · {date}" / "Lapsed · {date}".
    await expect(vis(page.getByText(/Covered ·|Lapsed ·/i))).toBeVisible()
    // The old bug rendered "Ongoing" instead of a date — make sure it's gone.
    await expect(page.getByText(/^Ongoing$/)).toHaveCount(0)
  })
})

test.describe("B · landing / seeded data", () => {
  test("Clean lands on the hub, not the session-setup form", async ({ page }) => {
    await gotoStable(page, "/clean")
    await expect(vis(page.getByText(/start cleaning|cleaning guides/i))).toBeVisible({ timeout: 20_000 })
    // The setup form's time-budget chips should NOT be on the landing view.
    await expect(page.getByText(/quick tidy|no limit/i)).toHaveCount(0)
  })

  test("Providers renders the seeded directory (not the empty state)", async ({ page }, testInfo) => {
    await gotoStable(page, "/providers")
    // All four seeded providers are listed…
    await expect(vis(page.getByText(/Ace Heating & Air/i))).toBeVisible({ timeout: 20_000 })
    await expect(vis(page.getByText(/Pro Plumb/i))).toBeVisible()
    await expect(vis(page.getByText(/Bright Spark Electric/i))).toBeVisible()
    // …so the empty state must be absent.
    await expect(page.getByText(/no service providers/i)).toHaveCount(0)

    if (!isMobile(testInfo.project.name)) {
      // Desktop: selecting a provider shows its contact actions in the detail pane.
      await vis(page.getByText(/Ace Heating & Air/i)).click()
      await expect(page.getByRole("link", { name: /call/i }).first()).toBeVisible()
    }
  })
})

test.describe("Ask · cited-answer view", () => {
  test("history rail opens a manual-cited answer", async ({ page }) => {
    await gotoStable(page, "/chat")
    const convo = vis(page.getByText(/Descale Bosch dishwasher/i))
    // Conversation history needs the chat_conversations migration applied; if it
    // isn't, the rail is empty by design — skip rather than fail.
    if (!(await convo.isVisible({ timeout: 8_000 }).catch(() => false))) {
      test.skip(true, "chat_conversations migration not applied — no seeded history")
    }
    await convo.click()
    await expect(vis(page.getByText(/Bosch/i))).toBeVisible({ timeout: 15_000 })
    // The cited answer surfaces the manual source chip.
    await expect(vis(page.getByText(/Care & cleaning|p\.\s?38|Bosch 800/i))).toBeVisible()
  })
})
