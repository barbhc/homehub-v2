import { test, expect, type Locator, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { TEST_EMAIL, TEST_PASSWORD } from "../seed-config"

/**
 * Journey walks — the four happy paths from docs/user-journeys.md, chained the
 * way a homeowner actually walks them, with a screenshot at every step.
 *
 * This suite serves two masters at once:
 *  1. CI: the assertions gate the promises each step makes (a red step names
 *     the user promise that broke, not just a selector).
 *  2. /journey-smoke: every step is captured to $JOURNEY_OUT with a manifest,
 *     and the skill has Claude LOOK at the gallery — layout collapses, empty
 *     states posing as success, and wrong copy get caught by eyes, not pixels.
 *
 * Deliberately ONE worker + one file so the manifest ordering is stable.
 * Auth is done through the real UI in each journey (no storageState): the
 * sign-in screen is itself a step users walk.
 */

const OUT = process.env.JOURNEY_OUT || path.join("journey-report", "latest")
const visible = { visible: true } as const

type StepRecord = { n: number; journey: string; name: string; note: string; url: string; png: string }

// Resume the manifest if it exists: Playwright replaces the worker process
// after a test failure, and a fresh module clobbering manifest.json would
// silently drop every step the earlier worker captured. A NEW run gets a
// fresh dir (the smoke script timestamps JOURNEY_OUT), so resuming is safe.
function loadManifest(): { runAt: string; steps: StepRecord[] } {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"))
  } catch {
    return { runAt: new Date().toISOString(), steps: [] }
  }
}
const manifest = loadManifest()
let stepN = manifest.steps.reduce((m, s) => Math.max(m, s.n), 0)

/**
 * Capture one step.
 *
 * `anchor` is REQUIRED after any navigation, and it is not ceremony: routes are
 * lazy-loaded, and `waitForURL` resolves when the URL changes, not when the
 * destination paints. Without an anchor the shot lands on whatever is on screen
 * at that instant — the first gallery review caught both failure modes, a BLANK
 * frame (chunk not mounted yet) and a shot of the PREVIOUS page (old tree still
 * mounted). Both passed their assertions, because Playwright's own auto-waiting
 * covers the click that comes next. The pictures are the deliverable here, so
 * they get their own wait.
 *
 * Pass the element that only exists on the screen being documented.
 */
async function snap(page: Page, journey: string, name: string, note: string, anchor?: Locator) {
  if (anchor) await anchor.waitFor({ state: "visible", timeout: 20_000 })
  // Belt and braces: never shoot an empty document, even without an anchor.
  await page.waitForFunction(
    () => ((document.querySelector("main") ?? document.body)?.innerText ?? "").trim().length > 20,
    null,
    { timeout: 20_000 },
  )
  stepN += 1
  fs.mkdirSync(OUT, { recursive: true })
  const png = `${String(stepN).padStart(2, "0")}-${journey}-${name}.png`
  await page.screenshot({ path: path.join(OUT, png), fullPage: true })
  manifest.steps.push({ n: stepN, journey, name, note, url: page.url(), png })
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2))
}

async function signInSeeded(page: Page) {
  await page.goto("/signin")
  await page.locator('input[type="email"]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.getByRole("button", { name: /^sign in$/i }).click()
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 20_000 })
}

test.describe("journey walks", () => {
  test("J1 — onboarding: brand-new person to first item", async ({ page }) => {
    await page.goto("/")
    await snap(page, "J1", "landing", "Marketing page: hero copy, Get started, Sign in — no errors",
      page.getByRole("heading", { name: /Everything your home needs/i }).first())

    // Fresh account every run — the emulator is cleared+seeded per invocation,
    // and a unique address keeps re-runs against a warm emulator honest too.
    const email = `journey-${Date.now()}@homehub.test`
    await page.goto("/signup")
    await snap(page, "J1", "signup", "Auth card in create-account mode: email+password, Apple, magic link",
      page.getByRole("button", { name: /^create account$/i }).first())
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill("JourneyWalk!2026")
    await page.getByRole("button", { name: /^create account$/i }).click()

    // First landing signed-in with no home → "Set up your home".
    await expect(page.getByText("Set up your home").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await snap(page, "J1", "home-setup", "Set up your home: name field (+ sample-home escape hatch); invite gate fails open on emulator")
    await page.getByPlaceholder(/My House, Downtown Apartment/).fill("Journey Test Home")
    await page.getByRole("button", { name: /^Continue$/ }).click()

    // Home profile (5 questions, skippable) follows; honor the skip path.
    await page
      .waitForURL(/\/onboarding\/profile/, { timeout: 10_000 })
      .then(async () => {
        await snap(page, "J1", "profile", "Home profile questions — every one skippable ('Suggest, never assume')",
          page.getByRole("button", { name: /skip for now/i }).first())
        await page.getByRole("button", { name: /skip for now/i }).click()
      })
      .catch(() => {/* profile step not offered — fine, the funnel continues */})

    // HH-93: finishing (or skipping) the profile no longer drops you into the
    // add form — it ASKS. Both doors are real; this walk takes the first.
    const fork = page.getByText("Your home profile is set").filter(visible).first()
    await expect(fork).toBeVisible({ timeout: 20_000 })
    await snap(page, "J1", "profile-done", "Where next? — 'Add your first item' or 'Take me to my home page' (asked, not assumed)", fork)
    await page.getByRole("link", { name: /Add your first item/i }).filter(visible).first().click()
    await page.waitForURL(/\/inventory\/add/, { timeout: 20_000 })

    // First item through the simple lane. REGRESSION GUARD (2026-08-21): the
    // Name field must be on the MAIN COLUMN — it was trapped inside the
    // collapsed "Add more details" accordion, dead-ending every simple add.
    await snap(page, "J1", "lane-chooser", "Two-lane start: Appliance or device / Everything else",
      page.getByRole("button", { name: /Everything else/ }).first())
    await page.getByRole("button", { name: /Everything else/ }).click()
    const name = page.locator("#identify-name")
    await expect(name.filter(visible).first()).toBeVisible({ timeout: 10_000 })
    await snap(page, "J1", "simple-lane", "Simple lane: Name visible WITHOUT opening 'Add more details'",
      name.filter(visible).first())
    await name.fill("Journey Kettle")
    const cta = page.getByRole("button", { name: /^Add item$/ }).filter(visible).first()
    await expect(cta).toBeEnabled({ timeout: 5_000 })
    await cta.click()

    await page.waitForURL(/\/items\//, { timeout: 20_000 })
    await expect(page.getByText("Journey Kettle").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await snap(page, "J1", "item-page", "Item page: new item by name; 'no manual yet' care block invites the manual",
      page.getByRole("button", { name: /Add the manual/ }).filter(visible).first())

    // Home now knows the item exists but has no upkeep — the nudge names the
    // next step (add a manual) instead of celebrating an empty schedule.
    await page.goto("/home")
    // A first visit brings the product tour; capture it, then close it (Esc —
    // allowClose) so the page underneath can be asserted.
    const tour = page.getByText("Welcome to Homehub!").filter(visible).first()
    if (await tour.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await snap(page, "J1", "product-tour", "First-run tour popover (1 of 5) over the dashboard", tour)
      await page.keyboard.press("Escape")
    }
    const upkeepHero = page.getByText(/No upkeep yet/i).filter(visible).first()
    await expect(upkeepHero).toBeVisible({ timeout: 15_000 })
    await snap(page, "J1", "home-after-first-item", "Home: 'No upkeep yet' banner pointing at the manual step; Journey Kettle under 'Finish setting up'",
      upkeepHero)
  })

  /**
   * J2 — the appliance lane, end to end (PRs #161–#163, 2026-08-22).
   *
   * The path the whole redesign is about: name it, attach the manual, and the
   * WIZARD ENDS. Everything after happens on the item page, which reports the
   * read itself. The parse callables are stubbed at the network layer because
   * this walks the CLIENT hand-off, not the worker.
   */
  test("J2 — add: appliance lane hands the parse to the item page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route("**/detectDocType", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ result: { docType: "manual", confidence: 0.95, reason: "stub" } }),
      })
    )
    await page.route("**/enqueueParse", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ result: { ok: true, requestId: "req-journey" } }),
      })
    )
    await signInSeeded(page)

    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()
    await page.locator("#identify-brand").fill("LG")
    await page.locator("#identify-model").fill("DLGX3901B")
    await snap(page, "J2", "appliance-lane", "Appliance lane: brand + model, and a stepper promising exactly two steps",
      page.getByRole("button", { name: /Next: add the manual/i }).filter(visible).first())
    await page.getByRole("button", { name: /Next: add the manual/i }).filter(visible).first().click()

    // Step 2 of 2 — and there is no step 3. Reading, Review and Purchase left
    // the wizard when the item page took the job over.
    //
    // Assert on what a PHONE shows: the stepper's labels are `hidden sm:inline`,
    // so at 390px the step names are not on screen at all — only the numbers.
    const analyze = page.getByRole("button", { name: /Analyze Manual/i }).filter(visible).first()
    await expect(page.getByRole("button", { name: /Upload PDF/i }).filter(visible).first())
      .toBeVisible({ timeout: 15_000 })
    await snap(page, "J2", "manual-step", "Step 2 of 2 — upload or link. No Reading, Review or Purchase step exists")
    await expect(page.getByText("Purchase", { exact: true })).toHaveCount(0)

    await page.setInputFiles('input[accept*="pdf"]', {
      name: "manual.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
    })
    await analyze.click()

    // The hand-off: the wizard is gone and the item page owns the outcome.
    //
    // Anchor on the item page's HEADING, not its text. "LG DLGX3901B" also
    // appears in the manual step's "Find it for me" card, so a getByText match
    // passed instantly against the screen we were leaving and the screenshot
    // caught the wizard mid-transition — a green step with the wrong picture,
    // which is the exact failure the gallery exists to catch.
    await page.waitForURL(/\/items\//, { timeout: 30_000 })
    const itemHeading = page.getByRole("heading", { name: "LG DLGX3901B" }).filter(visible).first()
    await expect(itemHeading).toBeVisible({ timeout: 20_000 })
    await snap(page, "J2", "living-item-page",
      "Landed on the item page seconds after adding — no Reading screen. Purchase nudge names what the data buys",
      itemHeading)
  })

  test("J3 — review: existing tasks through the review wizard", async ({ page }) => {
    // The "Review tasks" entry lives in the item page's Upkeep heading on the
    // MOBILE layout (see e2e/emu/task-review.spec.ts) — walk this one at phone
    // width, which also gives the gallery its mobile coverage.
    await page.setViewportSize({ width: 390, height: 844 })
    await signInSeeded(page)

    await page.goto("/items/dishwasher")
    await expect(page.getByText("Bosch 800 Series Dishwasher").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    await snap(page, "J3", "item-detail", "Seeded dishwasher: Upkeep block with its tasks and the Review tasks entry",
      page.getByRole("button", { name: /^Review tasks$/ }).filter(visible).first())

    await page.getByRole("button", { name: /^Review tasks$/ }).filter(visible).first().click()
    await expect(page.getByText(/worth tracking/).first()).toBeVisible({ timeout: 10_000 })
    await snap(page, "J3", "review-lead-in", "Lead-in names both routes; no dead Skip",
      page.getByText(/worth tracking/).first())

    // Open one task card: kind + tier controls, then Done.
    await page.getByRole("button", { name: /Descale the dishwasher/ }).first().click()
    await expect(page.getByText("What is it?")).toBeVisible()
    await snap(page, "J3", "review-task-card", "Task card: What is it? / How important? / remind switch",
      page.getByText("How important?").first())
    await page.getByRole("button", { name: /^Done$/ }).click()

    const next = page.getByRole("button", { name: /Next: schedule|^Save \d+ task/ }).last()
    await next.click()
    await snap(page, "J3", "review-schedule", "Step 2: cadence chips with 'The manual says…' anchors",
      page.getByText(/How often should these repeat/i).first())
    const save = page.getByRole("button", { name: /^Save \d+ task/ }).last()
    if (await save.isVisible().catch(() => false)) await save.click()

    await expect(page.getByText("What is it?")).toHaveCount(0, { timeout: 15_000 })
    await snap(page, "J3", "review-saved", "Sheet closed — the review write landed without an error",
      page.getByText("Bosch 800 Series Dishwasher").filter(visible).first())
  })

  test("J4 — agenda: window language, task detail, snooze + undo", async ({ page }) => {
    await signInSeeded(page)

    await page.goto("/home")
    const heroKicker = page.getByText(/A good week for these|need you/).filter(visible).first()
    await expect(heroKicker).toBeVisible({ timeout: 20_000 })
    await snap(page, "J4", "home-hero", "Hero: window kicker ('A good week for these'), stat band, Mark done + Snooze",
      heroKicker)

    await page.goto("/maintenance")
    await expect(page.getByText("Replace HVAC furnace filter").filter(visible).first()).toBeVisible({ timeout: 20_000 })
    // Windows-not-deadlines: lapsed safety earns "Worth doing", never "overdue".
    await expect(page.getByText("Worth doing").filter(visible).first()).toBeVisible({ timeout: 10_000 })
    await snap(page, "J4", "agenda", "Tasks: urgency lenses, calendar, 'Worth doing' safety nudge — calm language throughout",
      page.getByText("Worth doing").filter(visible).first())

    // Desktop rows expand in place; "View full guide" opens the detail page.
    await page.getByText("Replace HVAC furnace filter").filter(visible).first().click()
    await expect(page.getByRole("button", { name: /View full guide/ }).filter(visible).first()).toBeVisible({ timeout: 10_000 })
    await snap(page, "J4", "row-expanded", "Expanded row: Mark done, Snooze, View full guide — actions where the task lives",
      page.getByRole("button", { name: /View full guide/ }).filter(visible).first())
    await page.getByRole("button", { name: /View full guide/ }).filter(visible).first().click()
    await page.waitForURL(/\/tasks\//, { timeout: 15_000 })
    // The tune-this-task control exists ONLY on the detail page — without it as
    // the anchor this shot lands on the still-mounted Tasks list (it did).
    await snap(page, "J4", "task-detail", "Task detail: window phrase (not 'N days overdue'), steps, Mark done",
      page.getByRole("button", { name: /Tune this task/i }).filter(visible).first())

    // Snooze from Home (the hero action) — pure Firestore write, undoable.
    await page.goto("/home")
    const snooze = page.getByRole("button", { name: /^Snooze$/ }).filter(visible).first()
    await expect(snooze).toBeVisible({ timeout: 20_000 })
    await snooze.click()
    const undo = page.getByRole("button", { name: /^Undo$/ }).filter(visible).first()
    // The receipt IS the step — anchor on it so the shot can't beat it to screen.
    await snap(page, "J4", "snoozed", "Snoozed with a visible receipt + Undo — reversible by design", undo)
    if (await undo.isVisible().catch(() => false)) {
      await undo.click()
      await snap(page, "J4", "undone", "Undo restored the task — snooze is a two-way door",
        page.getByRole("button", { name: /^Snooze$/ }).filter(visible).first())
    }
  })
})
