import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { DESKTOP_VIEWPORT, EMULATOR_PROJECT_ID } from "../seed-config"

/**
 * The item page's own door for a manual — the pasted-link lane, walked from an
 * appliance that has no manual (BACKLOG §7.2: no walk attached a manual from
 * the item page).
 *
 * `item-add-manual.spec.ts` (#223) walks the two UPLOAD doors — Upkeep's "Add
 * the manual" and the drop-zone — at 390px and desktop. This file covers what
 * that one does not: the link lane ("Paste a link instead", HH-89/HH-129), from
 * a brand-and-model appliance rather than a name-only item, with the scan's
 * live state on the page afterwards.
 *
 * The enqueue is stubbed at the network layer (no functions emulator here), but
 * the stub does the one thing the real `enqueueParse` does before it returns:
 * it writes `parse.stage = "queued"` on the manual. Without that the page could
 * never show a scan, and the walk would pass over the state HH-161 is about.
 *
 * Counting rules (CLAUDE.md rule 3): dialogs and headings are counted with
 * `includeHidden` — the claim is "not RENDERED", and Radix hides everything
 * outside an open dialog from a plain role query.
 */
const HOME = "e2e-home"
const BRAND = "Bosch"
const MODEL = "SHX3AR75UC"
const MANUAL_URL = "https://example.com/bosch-shx3ar75uc-owners-manual.pdf"

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}

/** A seeded appliance with no manual. Its own id per walk (the emulator is
 *  shared by every spec in the run), and idempotent: a retry starts clean. */
async function seedApplianceWithoutManual(db: Firestore, itemId: string, name: string) {
  await clearItem(db, itemId)
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/items/${itemId}`).set({
    roomId: null, displayName: name, category: "dishwasher", itemCategory: "major_appliance",
    subType: "dishwasher", brand: BRAND, model: MODEL, status: "active", purchaseDate: null,
    warrantyDurationMonths: null, categoryFields: {}, tags: [], recallStatus: "none_found",
    recallCheckedAt: now, photoPath: null, createdAt: now, updatedAt: now, deletedAt: null,
  })
}

async function clearItem(db: Firestore, itemId: string) {
  const manuals = await db.collection(`homes/${HOME}/manuals`).where("itemUnitId", "==", itemId).get()
  for (const d of manuals.docs) await d.ref.delete()
  await db.doc(`homes/${HOME}/items/${itemId}`).delete()
}

/** The enqueue, faked the way the server behaves: stage first, then the answer. */
async function fakeEnqueue(page: Page, db: Firestore): Promise<{ count: () => number }> {
  let calls = 0
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" }
  await page.route("**/enqueueParse", async (route) => {
    // A preflight, if the browser sends one, is not a scan.
    if (route.request().method() !== "POST") return route.fulfill({ status: 204, headers: cors })
    calls += 1
    const body = route.request().postDataJSON() as { data?: { homeId?: string; manualId?: string; mode?: string } } | null
    const { homeId, manualId, mode } = body?.data ?? {}
    if (homeId && manualId) {
      const now = Timestamp.now()
      await db.doc(`homes/${homeId}/manuals/${manualId}`).set({
        parse: {
          stage: "queued", stageAt: now, requestId: `req-item-page-${calls}`, mode: mode ?? "preview",
          model: null, attempt: 0, error: null, summary: null,
        },
        updatedAt: now,
      }, { merge: true })
    }
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: "application/json",
      body: JSON.stringify({ result: { ok: true, requestId: `req-item-page-${calls}` } }),
    })
  })
  return { count: () => calls }
}

/** What the tray pill says is being read, as a number — 0 when it says nothing. */
async function trayReading(page: Page): Promise<number> {
  const pill = page.getByRole("button", { name: /\d+ reading/ })
  if ((await pill.count()) === 0) return 0
  return Number((await pill.first().textContent())?.match(/(\d+) reading/)?.[1] ?? 0)
}

/** Every role=dialog in the DOM, hidden or not. */
const allDialogs = (page: Page) => page.getByRole("dialog", { includeHidden: true })

/** Records whether any of these texts EVER rendered — "never appears", not
 *  just "is gone by the time we look". */
async function watchForText(page: Page, needles: string[]): Promise<() => Promise<string[]>> {
  await page.evaluate((list) => {
    const w = window as unknown as { __hhSeen?: string[] }
    w.__hhSeen = []
    const check = () => {
      const text = document.body.textContent ?? ""
      for (const n of list) if (text.includes(n) && !w.__hhSeen!.includes(n)) w.__hhSeen!.push(n)
    }
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true })
  }, needles)
  return () => page.evaluate(() => (window as unknown as { __hhSeen?: string[] }).__hhSeen ?? [])
}

function describeAt(label: string, viewport: { width: number; height: number }) {
  test.describe(`item page — paste a link to the manual (${label})`, () => {
    test.use({ viewport })
    const itemId = `e2e-attach-link-${label === "desktop" ? "desktop" : "390"}`
    const name = `Attach Walk Dishwasher ${label}`
    let db: Firestore

    test.beforeEach(async () => {
      db = emulatorDb()
      await seedApplianceWithoutManual(db, itemId, name)
    })
    test.afterEach(async () => {
      await clearItem(db, itemId)
    })

    test("one dialog, the link lane opens on its field, the first tap works, one scan — and the page shows it", async ({ page }) => {
      const enqueue = await fakeEnqueue(page, db)
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
      // One tree (HH-159): the heading is in the DOM once, and nothing is open.
      await expect(page.getByRole("heading", { name, exact: true, includeHidden: true })).toHaveCount(1)
      await expect(allDialogs(page)).toHaveCount(0)

      // The link lane lives in the manual section, which starts collapsed.
      await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
      await page.getByRole("button", { name: "Paste a link instead" }).click()
      await expect(allDialogs(page)).toHaveCount(1)
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByRole("heading", { name: "Add the manual" })).toBeVisible()

      // HH-89: the lane presets what it names — the link field is already open.
      const field = dialog.locator("#manual-url")
      await expect(field).toBeVisible()
      // HH-129: it says what kind of link, and hands over a search for THIS model.
      await expect(dialog.getByText("Must end in .pdf — not a web page")).toBeVisible()
      const google = dialog.getByRole("link", { name: "Search Google for this manual" })
      await expect(google).toHaveAttribute("href", /google\.com\/search\?q=Bosch%20SHX3AR75UC%20manual%20pdf/)

      const sawError = await watchForText(page, ["Enter a URL", "Select a PDF file"])
      await field.fill(MANUAL_URL)
      await dialog.getByRole("button", { name: "Scan the manual" }).click()

      // Success is the dialog closing itself: manual doc → scan started.
      await expect(allDialogs(page)).toHaveCount(0, { timeout: 30_000 })
      expect(await sawError()).toEqual([])
      await expect(page.getByRole("button", { name: /Manuals & References\s*\(1\)/ })).toBeVisible({ timeout: 10_000 })
      expect(enqueue.count()).toBe(1)

      // The page shows the scan it just started — once, as one indeterminate
      // rail (HH-135).
      const rail = page.getByRole("progressbar", { name: "Reading the manual", includeHidden: true })
      await expect(rail).toHaveCount(1, { timeout: 15_000 })
      await expect(rail).not.toHaveAttribute("aria-valuenow")

      // HH-161 (supersedes HH-118): ONE indicator. The pill counts THIS read
      // on this item's own page, and the same count everywhere else. At least
      // one here (a read another spec left running in the shared emulator may
      // add to it), and the same number on another page.
      await expect.poll(() => trayReading(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
      const here = await trayReading(page)
      await page.goto("/inventory")
      await expect.poll(() => trayReading(page), { timeout: 15_000 }).toBe(here)

      // Coming back only WATCHES the scan (audit 2026-09-29): no second enqueue.
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(rail).toHaveCount(1, { timeout: 15_000 })
      await page.waitForTimeout(2_000)
      expect(enqueue.count()).toBe(1)
      await expect(page.getByRole("heading", { name, exact: true, includeHidden: true })).toHaveCount(1)
    })

    // HH-161 (Package E2). The Upkeep card used to read the page's one-time
    // manuals list, where a manual added in-session had parse_stage null — so
    // it said "No upkeep yet — add the manual" and offered the button under the
    // band saying the manual was being read. The page reads its manuals live
    // now, and Upkeep carries the read itself.
    test("HH-161: while the manual just added is being read, Upkeep never offers to add a manual", async ({ page }) => {
      await fakeEnqueue(page, db)
      await page.goto(`/items/${itemId}`)
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
      await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
      await page.getByRole("button", { name: "Paste a link instead" }).click()
      await page.getByRole("dialog").locator("#manual-url").fill(MANUAL_URL)
      // "Never", not just "not at the end": from the tap on, every DOM change
      // is checked for the contradiction itself — the empty state's words on
      // the page while it also says the manual is being read.
      await page.evaluate(() => {
        const w = window as unknown as { __hhBoth?: number }
        w.__hhBoth = 0
        new MutationObserver(() => {
          const t = document.body.textContent ?? ""
          if (t.includes("No upkeep yet — add the manual") && t.includes("Reading the manual")) w.__hhBoth! += 1
        }).observe(document.body, { subtree: true, childList: true, characterData: true })
      })
      await page.getByRole("dialog").getByRole("button", { name: "Scan the manual" }).click()
      await expect(allDialogs(page)).toHaveCount(0, { timeout: 30_000 })
      await expect(page.getByRole("progressbar", { name: "Reading the manual", includeHidden: true })).toHaveCount(1, { timeout: 15_000 })

      await expect(page.getByText("No upkeep yet — add the manual")).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Add the manual", exact: true })).toHaveCount(0)
      // …said once (the rail above is the only one) and never beside the offer.
      await expect(page.getByText("Reading the manual", { exact: true })).toHaveCount(1)
      expect(await page.evaluate(() => (window as unknown as { __hhBoth?: number }).__hhBoth ?? 0)).toBe(0)
    })
  })
}

describeAt("390px", { width: 390, height: 844 })
describeAt("desktop", DESKTOP_VIEWPORT)
