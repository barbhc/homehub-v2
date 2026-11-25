import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { DESKTOP_VIEWPORT, EMULATOR_PROJECT_ID, SEED_TODAY } from "../seed-config"

/**
 * Before-friends PR D: Replace or Keep Both, in the real app (mock
 * r4-m2-replace, as the owner amended it: plain, one line, no last-done
 * promise).
 *
 * She added the typical "Clean the dishwasher filter" from the care library,
 * then the Whirlpool manual. Its review must, inside the "Clean the filter"
 * row and nowhere else, say "Same as your typical task “Clean the dishwasher
 * filter”?" (a wording-only match defaults to Keep Both, D11) over a
 * Replace / Keep Both radiogroup; tapping Replace says "Replaces your typical
 * task “…”"; Save sends her answer to `commitManualDraft` as `typicalChoices`.
 *
 * The emulator suites run without the Functions emulator, so the callable is
 * answered here; what the server does with the answer is proven against the
 * real callable in firebase/functions/test/typicalChoices.emu.test.mjs. This
 * spec proves the browser half: what is drawn, and what crosses the wire.
 *
 * Screenshots go to $REPLACE_SHOTS_DIR (default test-results/…, git-ignored),
 * for putting beside the mock — not for the repo.
 */
const HOME = "e2e-home"
const SHOTS = process.env.REPLACE_SHOTS_DIR ?? "test-results/replace-typical"
const TYPICAL_ID = "typ-replace-walk"

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}

const draftTask = (title: string, priority_tier = "recommended") => ({
  title, care_type: "maintenance", schedule_type: "monthly", priority_tier, description: null, risk_level: "performance",
  estimated_minutes: 10, interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [], keep_as_task: true,
})

async function clearItem(db: Firestore, itemId: string) {
  for (const col of ["manuals", "taskTemplates", "taskInstances"]) {
    const docs = await db.collection(`homes/${HOME}/${col}`).where("itemUnitId", "==", itemId).get()
    for (const d of docs.docs) await d.ref.delete()
  }
  await db.doc(`homes/${HOME}/items/${itemId}`).delete()
}

async function seed(db: Firestore, itemId: string, manualId: string, name: string) {
  await clearItem(db, itemId)
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/items/${itemId}`).set({
    roomId: null, displayName: name, category: "dishwasher", itemCategory: "major_appliance",
    subType: "dishwasher", brand: "Whirlpool", model: "WDT750SAKZ", status: "active", purchaseDate: null,
    warrantyDurationMonths: null, categoryFields: {}, tags: [], recallStatus: "none_found", recallCheckedAt: now,
    photoPath: null, createdAt: now, updatedAt: now, deletedAt: null,
  })
  // The typical task she added from the item page's no-manual card.
  await db.doc(`homes/${HOME}/taskTemplates/${TYPICAL_ID}-${itemId}`).set({
    scopeType: "item_unit", itemUnitId: itemId, roomId: null, title: "Clean the dishwasher filter", description: null,
    careType: "maintenance", priorityTier: "essential", riskLevel: "performance", remindEnabled: null, source: "cho_generated",
    isActive: true, isUserEditable: true, manualId: null, externalKey: "library:dishwasher.filter", metadata: {},
    schedule: { scheduleType: "monthly", intervalDays: null, anchorDate: SEED_TODAY, season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
    createdAt: now, updatedAt: now, deletedAt: null,
  })
  // The manual, read and waiting for its review.
  await db.doc(`homes/${HOME}/manuals/${manualId}`).set({
    itemUnitId: itemId, title: "Whirlpool manual", label: null, sourceType: "url", sourceRef: `https://example.com/${manualId}.pdf`,
    role: "primary", version: null, language: "en", parsedAt: null, draft: null,
    parse: { mode: "preview", stage: "done", requestId: `req-${manualId}`, pdfPages: 40, error: null, stageAt: now, summary: { chunks: 0, tasks: 3 } },
    previewDraft: {
      confidence: "high", chunks: [], requestId: `req-${manualId}`,
      tasks: [draftTask("Clean the filter", "essential"), draftTask("Run a cleaning cycle"), draftTask("Wipe the door gasket")],
    },
    createdAt: now, updatedAt: now, deletedAt: null,
  })
}

/** Answer the review's Save as the callable would, and keep what was sent. */
async function answerCommit(page: Page) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" }
  const sent: Record<string, unknown>[] = []
  await page.route("**/commitManualDraft", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 204, headers: cors })
    sent.push((route.request().postDataJSON() as { data: Record<string, unknown> }).data)
    return route.fulfill({
      status: 200, headers: cors, contentType: "application/json",
      body: JSON.stringify({ result: { ok: true, chunks: 0, tasks: 3, typicalReplaced: 1 } }),
    })
  })
  return sent
}

function describeAt(label: string, opts: { viewport: { width: number; height: number }; colorScheme: "light" | "dark"; shot: string }) {
  test.describe(`PR D Replace or Keep Both (${label})`, () => {
    test.use({ viewport: opts.viewport, colorScheme: opts.colorScheme })
    const suffix = opts.shot
    const itemId = `e2e-replace-${suffix}`
    const manualId = `manual-replace-${suffix}`
    const name = `Replace Walk Dishwasher ${suffix}`
    let db: Firestore

    test.beforeEach(async () => {
      db = emulatorDb()
      await seed(db, itemId, manualId, name)
    })
    test.afterEach(async () => { await clearItem(db, itemId) })

    test("the matched row asks, inside itself; Save sends her answer", async ({ page }) => {
      const sent = await answerCommit(page)
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
      await page.getByTestId("handoff-card").getByRole("button", { name: "Review 3 upkeep tasks" }).click()
      const sheet = page.getByRole("dialog")
      await expect(sheet.getByText("3 things from the manual")).toBeVisible()

      // Exactly one row asks, and it is the filter row.
      const ask = sheet.getByTestId("typical-replace")
      await expect(ask).toHaveCount(1)
      const row = ask.locator("xpath=..")
      await expect(row.getByRole("button", { name: /^Clean the filter/ })).toBeVisible()
      // D11: wording-only match → Keep Both, and the line asks rather than tells.
      await expect(ask).toContainText("Same as your typical task “Clean the dishwasher filter”?")
      const replace = ask.getByRole("radio", { name: "Replace" })
      const keep = ask.getByRole("radio", { name: "Keep Both" })
      await expect(keep).toHaveAttribute("aria-checked", "true")
      await expect(replace).toHaveAttribute("aria-checked", "false")
      // No promise the build does not keep (D2), and no tinted panel: the
      // question sits on the row's own surface.
      await expect(sheet.getByText(/last done date carries over/i)).toHaveCount(0)
      const bg = (el: Element) => getComputedStyle(el).backgroundColor
      expect(await ask.evaluate(bg)).toBe("rgba(0, 0, 0, 0)")
      // 44pt targets.
      for (const r of [replace, keep]) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: `${SHOTS}/replace-default-${suffix}.png`, animations: "disabled" })

      await replace.click()
      await expect(replace).toHaveAttribute("aria-checked", "true")
      await expect(ask).toContainText("Replaces your typical task “Clean the dishwasher filter”")
      await page.screenshot({ path: `${SHOTS}/replace-chosen-${suffix}.png`, animations: "disabled" })

      await sheet.getByRole("button", { name: "Save all 3" }).click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0].typicalChoices).toEqual([
        { title: "Clean the filter", templateId: `${TYPICAL_ID}-${itemId}`, choice: "replace" },
      ])
      expect((sent[0].tasks as { title: string }[]).map((t) => t.title).sort()).toEqual(
        ["Clean the filter", "Run a cleaning cycle", "Wipe the door gasket"],
      )
    })
  })
}

describeAt("390px light", { viewport: { width: 390, height: 844 }, colorScheme: "light", shot: "390-light" })
describeAt("390px dark", { viewport: { width: 390, height: 844 }, colorScheme: "dark", shot: "390-dark" })
describeAt("desktop", { viewport: DESKTOP_VIEWPORT, colorScheme: "light", shot: "desktop" })
