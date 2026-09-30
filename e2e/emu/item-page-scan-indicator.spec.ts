import { test, expect, type Page, type Locator } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { DESKTOP_VIEWPORT, EMULATOR_PROJECT_ID, SEED_TODAY } from "../seed-config"

/**
 * HH-161 — one scan indicator, walked against the real emulators, frame by
 * frame of the approved mock (design/mocks/scan-indicator, 2026-09-30).
 *
 * The worker is not part of this stack, so its writes are made here with the
 * admin SDK — exactly the fields `runParse` writes (stage, stageAt, requestId,
 * mode, pdfPages, previewDraft), in the order it writes them — and the review's
 * Save is answered the way `commitManualDraft` answers it: templates written,
 * `parsedAt` stamped, the draft cleared. Everything the PAGE does in between is
 * real: its live listener, the pill, the hand-off, the review.
 *
 * Counting (CLAUDE.md rule 3): "not rendered" is toHaveCount(0); "not shown"
 * is toBeHidden(). The seeded Sharp microwave already waits for its review, so
 * the pill's "ready to review" count is measured as a difference from the
 * seed's own, never as an absolute.
 *
 * Screenshots of each state go to $SCAN_SHOTS_DIR (default test-results/…,
 * which git ignores) — for putting beside the mock's frames, not for the repo.
 */
const HOME = "e2e-home"
const SHOTS = process.env.SCAN_SHOTS_DIR ?? "test-results/scan-indicator"

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}

type DraftTask = { title: string; care_type: string; schedule_type: string; priority_tier: string }
const task = (title: string, care_type: string, schedule_type: string, priority_tier = "recommended"): DraftTask =>
  ({ title, care_type, schedule_type, priority_tier })
const asDraft = (tasks: DraftTask[]) => ({
  confidence: "high",
  chunks: [],
  tasks: tasks.map((t) => ({
    ...t, description: null, risk_level: "performance", estimated_minutes: 5, interval_days: null,
    instructions_text: null, symptom_tags: [], re_check_triggers: [], keep_as_task: true,
  })),
})

/** S2/S4/S5's dishwasher: six maintenance rows (one Essential), four cleaning
 *  (two with a cadence), two setup — twelve things. */
const BOSCH = [
  task("Check the door seal", "maintenance", "annual", "essential"),
  task("Clean the filter", "maintenance", "monthly"),
  task("Descale the tub", "maintenance", "quarterly"),
  task("Clean the spray arms", "maintenance", "semiannual"),
  task("Clean the drain pump", "maintenance", "annual", "optional"),
  task("Check the drain hose", "maintenance", "annual", "optional"),
  task("Clean the tub and door edges", "cleaning", "monthly"),
  task("Clean the cutlery basket", "cleaning", "monthly", "optional"),
  task("Wipe the door", "cleaning", "as_needed"),
  task("Wipe the panel", "cleaning", "as_needed", "optional"),
  task("Level the dishwasher", "maintenance", "setup"),
  task("Connect the drain hose", "maintenance", "setup"),
]

/** S3's microwave: four cleaning (two with a cadence), two setup — no maintenance. */
const SHARP = [
  task("Clean the waveguide cover", "cleaning", "monthly"),
  task("Wipe the drawer interior", "cleaning", "weekly", "optional"),
  task("Clean the door seals", "cleaning", "as_needed"),
  task("Wipe the control panel", "cleaning", "as_needed", "optional"),
  task("Verify the drawer is grounded", "maintenance", "setup", "essential"),
  task("Level the drawer front", "maintenance", "setup"),
]

async function seedItem(db: Firestore, itemId: string, name: string, brand: string, model: string) {
  await clearItem(db, itemId)
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/items/${itemId}`).set({
    roomId: null, displayName: name, category: "dishwasher", itemCategory: "major_appliance",
    subType: "dishwasher", brand, model, status: "active", purchaseDate: null, warrantyDurationMonths: null,
    categoryFields: {}, tags: [], recallStatus: "none_found", recallCheckedAt: now, photoPath: null,
    createdAt: now, updatedAt: now, deletedAt: null,
  })
}

async function clearItem(db: Firestore, itemId: string) {
  for (const col of ["manuals", "taskTemplates", "taskInstances"]) {
    const docs = await db.collection(`homes/${HOME}/${col}`).where("itemUnitId", "==", itemId).get()
    for (const d of docs.docs) await d.ref.delete()
  }
  await db.doc(`homes/${HOME}/items/${itemId}`).delete()
}

/** The manual record, as the item page's add path creates it. */
async function seedManual(db: Firestore, manualId: string, itemId: string, title: string) {
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/manuals/${manualId}`).set({
    itemUnitId: itemId, title, label: null, sourceType: "url", sourceRef: `https://example.com/${manualId}.pdf`,
    role: "primary", version: null, language: "en", parsedAt: null, parse: null, draft: null,
    createdAt: now, updatedAt: now, deletedAt: null,
  })
}

/** One stage write, the way `runParse`'s writeOwned makes it (a merge, stamped). */
async function writeStage(db: Firestore, manualId: string, parse: Record<string, unknown>, top: Record<string, unknown> = {}) {
  const at = Timestamp.now()
  await db.doc(`homes/${HOME}/manuals/${manualId}`).set(
    { ...top, parse: { mode: "preview", error: null, ...parse, stageAt: at }, updatedAt: at },
    { merge: true },
  )
}

/** The review's Save, answered as `commitManualDraft` answers it. */
async function answerCommit(page: Page, db: Firestore, itemId: string) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" }
  let calls = 0
  await page.route("**/commitManualDraft", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 204, headers: cors })
    calls += 1
    const body = route.request().postDataJSON() as { data?: { manualId?: string; tasks?: Array<DraftTask & { remind_enabled?: boolean | null }> } }
    const { manualId, tasks = [] } = body.data ?? {}
    const now = Timestamp.now()
    let i = 0
    for (const t of tasks) {
      await db.doc(`homes/${HOME}/taskTemplates/tpl-${itemId}-${i++}`).set({
        scopeType: "item_unit", itemUnitId: itemId, roomId: null, title: t.title, description: null,
        careType: t.care_type, careTypeOverriddenAt: null, justification: null, symptomTags: [], reCheckTriggers: [],
        priorityTier: t.priority_tier, remindEnabled: t.remind_enabled ?? null, riskLevel: "performance",
        estimatedMinutes: t.title.includes("control panel") ? 2 : 5, defaultAssignee: null, instructionsChunkId: null,
        instructionsOverride: null, steps: null, sourcePage: null, suppliesMode: "none", supplies: [], source: "manual",
        isUserEditable: true, userModifiedAt: null, isActive: true, metadata: {}, manualId, externalKey: null,
        schedule: { scheduleType: t.schedule_type, intervalDays: null, anchorDate: SEED_TODAY, season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
        createdAt: now, updatedAt: now, deletedAt: null,
      })
    }
    await db.doc(`homes/${HOME}/manuals/${manualId}`).set(
      { parsedAt: now, previewDraft: null, parse: { stage: "done", stageAt: now, summary: { chunks: 0, tasks: tasks.length } }, updatedAt: now },
      { merge: true },
    )
    return route.fulfill({
      status: 200, headers: cors, contentType: "application/json",
      body: JSON.stringify({ result: { ok: true, chunks: 0, tasks: tasks.length } }),
    })
  })
  return { count: () => calls }
}

/** The pill (on every page, the item's own included). */
const pill = (page: Page) => page.getByRole("button", { name: /\d+ (reading|queued|ready to review)/ })
/** How many the pill says are waiting for review — 0 when it says none. */
async function readyCount(page: Page): Promise<number> {
  if ((await pill(page).count()) === 0) return 0
  return Number((await pill(page).first().textContent())?.match(/(\d+) ready to review/)?.[1] ?? 0)
}
const bells = (root: Locator) => root.locator("svg.lucide-bell-ring")
const anyBell = (root: Locator) => root.locator("svg.lucide-bell-ring, svg.lucide-bell-off, svg.lucide-bell")

async function shot(page: Page, label: string, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}${label === "390px" ? "" : "-desktop"}.png` })
}

function describeAt(label: "390px" | "desktop", viewport: { width: number; height: number }) {
  const suffix = label === "desktop" ? "desktop" : "390"

  test.describe(`HH-161 one scan indicator — the item page (${label})`, () => {
    test.use({ viewport })
    const itemId = `e2e-scan-ind-${suffix}`
    const manualId = `manual-scan-ind-${suffix}`
    const name = `Scan Walk Dishwasher ${suffix}`
    const title = `Scan Walk manual ${suffix}`
    let db: Firestore

    test.beforeEach(async () => {
      db = emulatorDb()
      await seedItem(db, itemId, name, "Bosch", "SHPM88Z75N")
      await seedManual(db, manualId, itemId, title)
    })
    test.afterEach(async () => { await clearItem(db, itemId) })

    test("S1 → S6 → S2 → S5: reading in Upkeep, the pill everywhere, the hand-off, the review in place", async ({ page }) => {
      const baseline = await (async () => { await page.goto("/home"); await page.waitForTimeout(1_500); return readyCount(page) })()

      // ── S1: the manual is being read ──────────────────────────────────────
      await writeStage(db, manualId, { stage: "queued", requestId: "req-scan-1" })
      await writeStage(db, manualId, { stage: "pdf_fetched", requestId: "req-scan-1", pdfPages: 42 })
      await writeStage(db, manualId, { stage: "claude_call", requestId: "req-scan-1", pdfPages: 42 })
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })

      // S1.1 — the only reading state on the page body is inside Upkeep: the
      // line, the worker's page count, the keeps-going line and ONE rail.
      await expect(page.getByText("Reading the manual", { exact: true })).toHaveCount(1)
      await expect(page.getByText("42 pages", { exact: true })).toBeVisible()
      await expect(page.getByText(/Pulling out care steps and schedules… You can close the app — these keep going\./)).toBeVisible()
      const rail = page.getByRole("progressbar", { name: "Reading the manual", includeHidden: true })
      await expect(rail).toHaveCount(1)
      await expect(rail).not.toHaveAttribute("aria-valuenow")
      // …and nothing above "‹ Items": the rail sits below the back link.
      const back = page.getByRole("button", { name: /Items/ }).first()
      expect((await rail.boundingBox())!.y).toBeGreaterThan((await back.boundingBox())!.y)
      // S1.2 — never the empty state, never its button (not rendered).
      await expect(page.getByText("No upkeep yet — add the manual")).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Add the manual", exact: true })).toHaveCount(0)
      // S1.3 — the pill reads "1 reading" on this item's OWN page.
      await expect(pill(page)).toBeVisible()
      await expect(pill(page)).toHaveText(/(^|· )1 reading( ·|$)/)
      // S1.4 — the Ask card.
      await expect(page.getByText("Works best once we’ve read the manual.").first()).toBeVisible()
      // S1.5 — the worker's count only; never a position it does not report.
      await expect(page.getByText(/page \d+ of \d+/)).toHaveCount(0)
      await shot(page, label, "s1-item-reading")

      // ── S6: the same read, from Home ─────────────────────────────────────
      await page.goto("/home")
      await expect(pill(page)).toHaveText(/(^|· )1 reading( ·|$)/, { timeout: 20_000 })
      // S6.3 — Home shows no other reading indicator.
      await expect(page.getByText("Reading the manual")).toHaveCount(0)
      await expect(page.getByRole("progressbar")).toHaveCount(0)
      await shot(page, label, "s6-home-pill")
      // S6.2 — the tray: the manual, "42 pages", and the keeps-going line.
      await pill(page).click()
      await expect(page.getByText(title)).toBeVisible()
      await expect(page.getByText("42 pages", { exact: true })).toBeVisible()
      await expect(page.getByText("You can close the app — these keep going.").first()).toBeVisible()
      await shot(page, label, "s6-home-tray")

      // ── S2: the read finished while nobody was looking ───────────────────
      await writeStage(db, manualId, { stage: "done", requestId: "req-scan-1", pdfPages: 42, summary: { chunks: 0, tasks: BOSCH.length } },
        { previewDraft: asDraft(BOSCH) })
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
      // S2.1 — exactly one hand-off card, and its count is the Maintenance count.
      const card = page.getByTestId("handoff-card")
      await expect(card).toHaveCount(1, { timeout: 15_000 })
      await expect(card).toContainText(`We read the ${name} manual`)
      await expect(card.getByRole("button", { name: "Review 6 upkeep tasks" })).toBeVisible()
      // S2.2 — no reading line or rail anywhere.
      await expect(page.getByRole("progressbar", { includeHidden: true })).toHaveCount(0)
      await expect(page.getByText("Reading the manual")).toHaveCount(0)
      // S2.4 — this page did not watch it finish: the card waits.
      await expect(page.getByRole("dialog")).toHaveCount(0)
      // S2.5 — Upkeep holds the space, with no button of its own.
      await expect(page.getByText("Upkeep lands here once you save the review.")).toBeVisible()
      await expect(page.getByText("No upkeep yet — add the manual")).toHaveCount(0)
      // S2.3 — the pill counts it, here too.
      await expect.poll(() => readyCount(page), { timeout: 15_000 }).toBe(baseline + 1)
      await shot(page, label, "s2-item-handoff")

      // S2.3 — the pill's Review opens THIS review in place, no navigation.
      const url = page.url()
      await pill(page).click()
      const row = page.getByRole("listitem").filter({ hasText: title })
      await row.getByRole("button", { name: "Review" }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toHaveCount(1)
      expect(page.url()).toBe(url)
      await expect(dialog.getByText("12 things from the manual")).toBeVisible()

      // ── S5: headless Chromium has refused notifications ───────────────────
      // S5.1 — no bell anywhere in the review.
      await expect(bells(dialog)).toHaveCount(0)
      // S5.3 — the Tasks line unchanged; the second line says why.
      await expect(dialog.getByText("6 will show up in Tasks")).toBeVisible()
      await expect(dialog.getByText("None will notify you. Notifications are off on this phone.")).toBeVisible()
      // S5.2 — the Essential row keeps its chip and says so, muted.
      const essential = dialog.getByRole("button", { name: /Check the door seal/ }).first()
      await expect(essential).toContainText("Yearly")
      await expect(essential).toContainText("Reminders off — turn on in Settings")
      // S4.4 — cadenced cleaning lives on the item page, and never rings.
      await expect(dialog.getByRole("button", { name: /Clean the tub and door edges/ }).first()).toContainText("Lives on the item page")
      // S4.5 — Save saves every row the review lists.
      await expect(dialog.getByRole("button", { name: "Save all 12" })).toBeVisible()
      await shot(page, label, "s5-review-notifications-off")
    })

    test("S3 → S3b → S3c: no maintenance — the same hand-off, one screen, nothing into Tasks, saved only on Save", async ({ page }) => {
      await page.goto("/home")
      await page.waitForTimeout(1_500)
      const baseline = await readyCount(page)
      const commit = await answerCommit(page, db, itemId)
      await writeStage(db, manualId, { stage: "done", requestId: "req-sharp-1", pdfPages: 48, summary: { chunks: 0, tasks: SHARP.length } },
        { previewDraft: asDraft(SHARP) })
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })

      // ── S3: the SAME hand-off card ─────────────────────────────────────────
      const card = page.getByTestId("handoff-card")
      await expect(card).toHaveCount(1, { timeout: 15_000 })
      await expect(card).toContainText(`We read the ${name} manual`)
      const review = card.getByRole("button", { name: "Review 6 tips & steps" })
      await expect(review).toBeVisible()
      // S3.2 — no other card, and round 14's sentence nowhere.
      await expect(page.getByText(/No maintenance in this manual/)).toHaveCount(0)
      await expect(page.getByText(/nothing will remind you/)).toHaveCount(0)
      // S3.4 — nothing saved yet: Upkeep holds the space, no rows.
      await expect(page.getByText("Upkeep lands here once you save the review.")).toBeVisible()
      await expect(page.getByTestId("care-row")).toHaveCount(0)
      // S3.5 — the pill.
      await expect.poll(() => readyCount(page), { timeout: 15_000 }).toBe(baseline + 1)
      await shot(page, label, "s3-item-handoff-no-maintenance")

      // ── S3b: the review ─────────────────────────────────────────────────────
      await review.click()
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("6 things from the manual")).toBeVisible()
      // S3b.1 — Cleaning then Setup; no Maintenance section (not rendered).
      // Read by each section's own sub-line: a section header's text also
      // carries its count ("Cleaning4"), so a heading match would be brittle.
      await expect(dialog.getByText("Keeps it working. Turn a notification on for any of these.")).toHaveCount(0)
      const cleaningSub = dialog.getByText("Keeps it nice. Lives on the item page.")
      const setupSub = dialog.getByText("Once, when you install it.")
      await expect(cleaningSub).toBeVisible()
      await expect(setupSub).toBeVisible()
      expect((await cleaningSub.boundingBox())!.y).toBeLessThan((await setupSub.boundingBox())!.y)
      // S3b.2 — the summary.
      await expect(dialog.getByText("Nothing here goes into Tasks.")).toBeVisible()
      await expect(dialog.getByText("Nothing is saved until you press Save.")).toBeVisible()
      await expect(dialog.getByText(/notify/)).toHaveCount(0)
      // S3b.3 — zero bells of any kind.
      await expect(anyBell(dialog)).toHaveCount(0)
      // S3b.4 — cadences kept, each with "Lives on the item page".
      // Exact: the Cleaning section's own sub-line also contains the words.
      await expect(dialog.getByText("Lives on the item page", { exact: true })).toHaveCount(2)
      await expect(dialog.getByText("when needed", { exact: true })).toHaveCount(2)
      // S3b.5 — and Save is the only thing that saves.
      expect(commit.count()).toBe(0)
      const save = dialog.getByRole("button", { name: "Save all 6" })
      await expect(save).toBeVisible()
      await shot(page, label, "s3b-review-no-maintenance")
      await save.click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 })
      expect(commit.count()).toBe(1)

      // ── S3c: after Save ─────────────────────────────────────────────────────
      const lives = page.getByTestId("upkeep-lives-here")
      await expect(lives).toBeVisible({ timeout: 15_000 })
      await expect(lives).toContainText("Nothing here goes into Tasks")
      await expect(lives).toContainText("4 cleaning tips and 2 setup steps live below.")
      // S3c.3 — cadences in the rows' meta lines.
      const rows = page.getByTestId("care-row")
      await expect(rows.filter({ hasText: "Wipe the drawer interior" })).toContainText("Weekly")
      await expect(rows.filter({ hasText: "Clean the waveguide cover" })).toContainText("Monthly")
      // S3c.4 — no bell on any row.
      await expect(page.getByLabel("Notifies you")).toHaveCount(0)
      // S3c.5 — no hand-off card, and the pill no longer counts this manual.
      await expect(page.getByTestId("handoff-card")).toHaveCount(0)
      await expect.poll(() => readyCount(page), { timeout: 15_000 }).toBe(baseline)
      await shot(page, label, "s3c-item-after-save")
    })
  })

  test.describe(`HH-161 — the review with notifications ON (${label})`, () => {
    // Headless Chromium answers "denied" for notifications whatever the
    // context grants (probed: `permissions: ["notifications"]` and
    // grantPermissions both leave Notification.permission "denied"), so the
    // phone that said YES is stood in for at the one thing the app reads.
    test.use({ viewport })
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" })
      })
    })
    const itemId = `e2e-scan-ind-on-${suffix}`
    const manualId = `manual-scan-ind-on-${suffix}`
    const name = `Scan Walk Bosch ${suffix}`
    let db: Firestore

    test.beforeEach(async () => {
      db = emulatorDb()
      await seedItem(db, itemId, name, "Bosch", "SHPM88Z75N")
      await seedManual(db, manualId, itemId, `Bosch manual ${suffix}`)
    })
    test.afterEach(async () => { await clearItem(db, itemId) })

    test("S4 — a count that matches Tasks, and bells only where they ring", async ({ page }) => {
      await writeStage(db, manualId, { stage: "done", requestId: "req-bosch-on", pdfPages: 42, summary: { chunks: 0, tasks: BOSCH.length } },
        { previewDraft: asDraft(BOSCH) })
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
      await page.getByTestId("handoff-card").getByRole("button", { name: "Review 6 upkeep tasks" }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByText("12 things from the manual")).toBeVisible()
      // S4.1 — six, not the eight a cadence count gives.
      await expect(dialog.getByText("6 will show up in Tasks")).toBeVisible()
      // S4.2 — one of those notifies, and one bell on a row says so.
      await expect(dialog.getByText("1 of those will also notify your phone.")).toBeVisible()
      await expect(dialog.getByLabel("Notifies you")).toHaveCount(1)
      // S4.3 — on the Essential row, beside its "Yearly" chip.
      const essential = dialog.getByRole("button", { name: /Check the door seal/ }).first()
      await expect(essential.getByLabel("Notifies you")).toHaveCount(1)
      await expect(essential).toContainText("Yearly")
      // S4.4 — a cleaning row with a cadence: "Lives on the item page", no bell.
      const cleaning = dialog.getByRole("button", { name: /Clean the tub and door edges/ }).first()
      await expect(cleaning).toContainText("Lives on the item page")
      await expect(cleaning.getByLabel("Notifies you")).toHaveCount(0)
      await expect(dialog.getByRole("button", { name: "Save all 12" })).toBeVisible()
      await shot(page, label, "s4-review-count-matches-tasks")
    })
  })

  test.describe(`HH-48 — a read this page WATCHED finish opens its review (${label})`, () => {
    test.use({ viewport })
    const itemId = `e2e-scan-ind-watch-${suffix}`
    const manualId = `manual-scan-ind-watch-${suffix}`
    const name = `Scan Walk Watched ${suffix}`
    let db: Firestore

    test.beforeEach(async () => {
      db = emulatorDb()
      await seedItem(db, itemId, name, "Sharp", "SMD2470ASY24")
      await seedManual(db, manualId, itemId, `Watched manual ${suffix}`)
    })
    test.afterEach(async () => { await clearItem(db, itemId) })

    test("S3.3 / S2.4 — watched to the end, the review opens by itself, in place of the card — with no maintenance too", async ({ page }) => {
      await writeStage(db, manualId, { stage: "claude_call", requestId: "req-watch-1", pdfPages: 12 })
      await page.goto(`/items/${itemId}`)
      await expect(page.getByText("Reading the manual", { exact: true })).toHaveCount(1, { timeout: 20_000 })
      await writeStage(db, manualId, { stage: "done", requestId: "req-watch-1", pdfPages: 12, summary: { chunks: 0, tasks: SHARP.length } },
        { previewDraft: asDraft(SHARP) })
      // The page's next section — not a drawer, and the card it replaces is gone.
      await expect(page.getByText("6 things from the manual")).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await expect(page.getByTestId("handoff-card")).toHaveCount(0)
      await expect(page.getByText("Reading the manual")).toHaveCount(0)
    })
  })
}

describeAt("390px", { width: 390, height: 844 })
describeAt("desktop", DESKTOP_VIEWPORT)
