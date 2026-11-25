import { test, expect, gotoStable } from "../fixtures"
import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { EMULATOR_PROJECT_ID } from "../seed-config"

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
  // Views of Items and Tasks since design/tasks-items-views.md (their old
  // addresses redirect here).
  { name: "warranties", path: "/inventory?view=warranties", ready: /Bosch|coverage/i },
  { name: "clean", path: "/maintenance?view=cleaning", ready: /start cleaning|cleaning guides/i },
  { name: "providers", path: "/providers", ready: /Ace Heating & Air/i },
  { name: "settings", path: "/settings", ready: /appearance/i },
  // Settings is a menu; these are the pages its rows open, and the two that
  // left it for Items and Tasks (design/settings-your-home.md).
  { name: "your home", path: "/your-home", ready: /In a pinch/i },
  { name: "notifications", path: "/settings/notifications", ready: /Notifications/ },
  { name: "rooms", path: "/inventory/rooms", ready: /Living Room/ },
  { name: "your own tasks", path: "/maintenance/custom", ready: /Shows in/ },
]

/**
 * The signed-out screens. They were outside the scan entirely, which is how
 * they kept colours from the original handoff after the app's tokens were
 * raised to AA: the sign-in password toggle sat at 2.5:1, the reset page's
 * error text at 3.4:1. Scanned in BOTH themes, because Appearance defaults to
 * "system" — a phone in dark mode opens sign-in dark — and the input boxes
 * there were literal white under near-white text.
 *
 * /invite/:token is not here: resolving a token needs the Functions emulator,
 * which this config does not start.
 */
const SIGNED_OUT_PAGES: PageCase[] = [
  { name: "landing", path: "/", ready: /everything your home needs/i },
  { name: "sign-in", path: "/signin", ready: /welcome back/i },
  { name: "reset-password (bad link)", path: "/reset-password", ready: /that link didn't work/i },
  { name: "not-found", path: "/no-such-page", ready: /page not found/i },
  // account-after-list: the first minute is a visitor's page now (no account).
  { name: "first minute (zip)", path: "/onboarding/first", ready: /where's home/i },
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

async function expectNoBlockingViolations(page: Page, p: PageCase) {
  await gotoStable(page, p.path)
  // Filter to visible matches: the responsive layout keeps hidden
  // desktop/mobile variants in the DOM, so `.first()` can resolve to a hidden
  // element and wait forever on something that will never be visible.
  await page.getByText(p.ready).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 20_000 })
  await expectCleanScan(page, p.name)
}

/** Scan the page as it stands now; fail on any critical/serious violation. */
async function expectCleanScan(page: Page, name: string) {
  const p = { name }
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
}

for (const p of PAGES) {
  test(`${p.name} has no critical/serious a11y violations`, async ({ page }) => {
    await expectNoBlockingViolations(page, p)
  })
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`signed out, ${colorScheme}`, () => {
    // A fresh context: no Firebase session in IndexedDB, so these render as a
    // visitor sees them instead of redirecting into the app.
    test.use({ storageState: { cookies: [], origins: [] }, colorScheme })

    for (const p of SIGNED_OUT_PAGES) {
      test(`${p.name} (${colorScheme}) has no critical/serious a11y violations`, async ({ page }) => {
        await expectNoBlockingViolations(page, p)
      })
    }
  })
}

/**
 * Home with nothing in it (before-friends mock 1): "What's in your home?" in
 * all three of its states — Pick (with chips ticked), Care, and the collapsed
 * row — at both viewports (the mobile project is 390px wide) and in both
 * themes. The seeded home is full, so each run makes its own empty home for a
 * fresh account in the emulator (its own sentinel: specs share seeded state).
 */
async function emptyHomeAccount(tag: string): Promise<{ email: string; password: string }> {
  const app = getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID })
  const email = `a11y-empty-${tag}-${Date.now()}@homehub.test`
  const password = "A11yEmpty!2026"
  const { uid } = await getAuth(app).createUser({ email, password, emailVerified: true })
  const db = getFirestore(app)
  const now = Timestamp.now()
  const homeId = `a11y-empty-${uid}`
  await db.doc(`homes/${homeId}`).set({
    name: "Empty Home", timezone: "America/Los_Angeles", createdBy: uid, homeType: "condo", ownership: "own",
    preferredMode: "inventory_first", profileCompletedAt: now, createdAt: now, updatedAt: now, deletedAt: null,
  })
  await db.doc(`homes/${homeId}/members/${uid}`).set({ uid, role: "owner", isPrimary: true, joinedAt: now })
  await db.doc(`homes/${homeId}/rooms/kitchen`).set({ name: "Kitchen", createdAt: now, updatedAt: now, deletedAt: null })
  await db.doc(`users/${uid}`).set({ fullName: null, avatarUrl: null, createdAt: now, updatedAt: now })
  // The tour is held by the card anyway (data-tour-halt); off here so a later visit never covers the scan.
  await db.doc(`users/${uid}/private/preferences`).set({ tour_completed: true, updatedAt: now })
  return { email, password }
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`empty Home, ${colorScheme}`, () => {
    test.use({ storageState: { cookies: [], origins: [] }, colorScheme })

    test(`What's in your home? in all three states (${colorScheme}) has no critical/serious a11y violations`, async ({ page }, info) => {
      // A sign-in and three scans: more than the suite's default 60 s on a slow run.
      test.setTimeout(150_000)
      const { email, password } = await emptyHomeAccount(`${info.project.name}-${colorScheme}`)
      // The sign-in screen settled first (gotoStable + its heading): a fill
      // racing the first paint once sent the form nowhere (landed on /).
      await gotoStable(page, "/signin")
      await page.getByText(/welcome back/i).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 20_000 })
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.getByRole("button", { name: /^sign in$/i }).click()
      // Signed in once the page leaves /signin. Then open Home directly: on
      // WebKit against the emulator, Index's / → /home hand-off sometimes sat
      // on "/" past 40 s while the same account opened /home at once.
      await expect(page).not.toHaveURL(/\/signin/, { timeout: 20_000 })
      await gotoStable(page, "/home")

      const card = page.getByTestId("empty-home-card").filter({ visible: true }).first()
      await expect(card.getByRole("button", { name: "Not now" })).toBeEnabled({ timeout: 20_000 })
      await card.getByRole("button", { name: "Smoke alarms" }).click()
      await card.getByRole("button", { name: "Dishwasher" }).click()
      await expectCleanScan(page, `empty home: pick (${colorScheme})`)

      // Appliance chips only into Care: See Suggested Care then writes nothing
      // (a fact chip writes the profile, and browser writes against the
      // emulator can hang on WebKit — reference_emulator_e2e_wedge). The fact
      // write itself is covered by the unit tests and the journey walk.
      await card.getByRole("button", { name: "Smoke alarms" }).click()
      await card.getByRole("button", { name: "Water heater" }).click()
      await card.getByRole("button", { name: "See Suggested Care" }).click()
      const care = page.getByTestId("empty-home-care").filter({ visible: true }).first()
      await expect(care.getByRole("button", { name: "Add Clean the dishwasher filter" })).toBeVisible({ timeout: 20_000 })
      await expectCleanScan(page, `empty home: care (${colorScheme})`)

      await care.getByRole("button", { name: "Edit what you have" }).click()
      await page.getByTestId("empty-home-card").filter({ visible: true }).first().getByRole("button", { name: "Not now" }).click()
      await expect(page.getByTestId("empty-home-collapsed").filter({ visible: true }).first()).toBeVisible()
      await expectCleanScan(page, `empty home: collapsed (${colorScheme})`)
    })
  })
}
