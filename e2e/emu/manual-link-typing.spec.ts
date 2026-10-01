import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { EMULATOR_PROJECT_ID } from "../seed-config"

/**
 * The manual's link field, TYPED key by key in a real browser.
 *
 * ManualStep showed its "Manual link added" card whenever the field held any
 * text, so the first typed character replaced the field with the card — focus
 * gone, and a link could only ever be pasted. The card now waits for a paste,
 * Enter, or a COMPLETE link leaving the field or arriving at once — and a
 * press outside the step ("Reference doc") lands before the swap. jsdom pins
 * that in ManualStep.test.tsx; this walks it through the item page's link lane
 * (the door item-page-manual.spec.ts fills in one go) with real key events
 * and real layout.
 *
 * The enqueue is stubbed at the network layer as in item-page-manual.spec.ts:
 * it writes parse.stage = "queued" and answers ok, so Scan completes.
 */
const HOME = "e2e-home"
const URL_TYPED = "https://example.com/bosch-typed-owners-manual.pdf"

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}

async function clearItem(db: Firestore, itemId: string) {
  const manuals = await db.collection(`homes/${HOME}/manuals`).where("itemUnitId", "==", itemId).get()
  for (const d of manuals.docs) await d.ref.delete()
  await db.doc(`homes/${HOME}/items/${itemId}`).delete()
}

/** An appliance with brand and model and no manual — its own id, so a retry starts clean. */
async function seedAppliance(db: Firestore, itemId: string, name: string) {
  await clearItem(db, itemId)
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/items/${itemId}`).set({
    roomId: null, displayName: name, category: "dishwasher", itemCategory: "major_appliance",
    subType: "dishwasher", brand: "Bosch", model: "SHX3AR75UC", status: "active", purchaseDate: null,
    warrantyDurationMonths: null, categoryFields: {}, tags: [], recallStatus: "none_found",
    recallCheckedAt: now, photoPath: null, createdAt: now, updatedAt: now, deletedAt: null,
  })
}

async function fakeEnqueue(page: Page, db: Firestore): Promise<{ count: () => number }> {
  let calls = 0
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" }
  await page.route("**/enqueueParse", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 204, headers: cors })
    calls += 1
    const body = route.request().postDataJSON() as { data?: { homeId?: string; manualId?: string; mode?: string } } | null
    const { homeId, manualId, mode } = body?.data ?? {}
    if (homeId && manualId) {
      const now = Timestamp.now()
      await db.doc(`homes/${homeId}/manuals/${manualId}`).set({
        parse: {
          stage: "queued", stageAt: now, requestId: `req-typed-${calls}`, mode: mode ?? "preview",
          model: null, attempt: 0, error: null, summary: null,
        },
        updatedAt: now,
      }, { merge: true })
    }
    return route.fulfill({
      status: 200, headers: cors, contentType: "application/json",
      body: JSON.stringify({ result: { ok: true, requestId: `req-typed-${calls}` } }),
    })
  })
  return { count: () => calls }
}

test.describe("emulator e2e — a manual link can be typed", () => {
  const itemId = "e2e-link-typed"
  const name = "Typed Link Dishwasher"
  let db: Firestore

  test.beforeEach(async () => {
    db = emulatorDb()
    await seedAppliance(db, itemId, name)
  })
  test.afterEach(async () => {
    await clearItem(db, itemId)
  })

  test("key by key, the field keeps focus and every character; Enter shows the link; Scan adds it", async ({ page }) => {
    const enqueue = await fakeEnqueue(page, db)
    await page.goto(`/items/${itemId}`)
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
    await page.getByRole("button", { name: "Paste a link instead" }).click()
    const dialog = page.getByRole("dialog")
    const field = dialog.locator("#manual-url")
    await field.click()
    await expect(field).toBeFocused()

    // Half the link, a key at a time: still the field, still focused, nothing chosen.
    const half = URL_TYPED.slice(0, 20)
    await field.pressSequentially(half)
    await expect(field).toBeFocused()
    await expect(field).toHaveValue(half)
    await expect(dialog.getByText("Manual link added")).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "Scan the manual" })).toHaveCount(0)

    // The rest. The same element holds all of it.
    await field.pressSequentially(URL_TYPED.slice(20))
    await expect(field).toBeFocused()
    await expect(field).toHaveValue(URL_TYPED)
    await expect(dialog.getByText("Manual link added")).toHaveCount(0)

    await field.press("Enter")
    await expect(dialog.getByText("Manual link added")).toBeVisible()
    await expect(dialog.getByText(URL_TYPED)).toBeVisible()
    expect(enqueue.count(), "Enter shows the link — it does not scan").toBe(0)

    await dialog.getByRole("button", { name: "Scan the manual" }).click()
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(0, { timeout: 30_000 })
    expect(enqueue.count()).toBe(1)
    await expect(page.getByRole("button", { name: /Manuals & References\s*\(1\)/ })).toBeVisible({ timeout: 10_000 })
  })

  test("a whole link arriving in one change (autofill; Playwright's fill) is chosen at once", async ({ page }) => {
    // The path item-page-manual.spec.ts walks: fill, then Scan with no Enter.
    await page.goto(`/items/${itemId}`)
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
    await page.getByRole("button", { name: "Paste a link instead" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.locator("#manual-url").fill(URL_TYPED)
    await expect(dialog.getByText("Manual link added")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Scan the manual" })).toBeEnabled()
  })

  test("a typed link, then 'Reference doc': that tap lands, THEN the link is chosen", async ({ page }) => {
    // The dialog's "What is this document?" buttons sit below the step.
    // Swapping the field for the card on that press's blur moved them before
    // the click, and the tap was lost.
    await page.goto(`/items/${itemId}`)
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
    await page.getByRole("button", { name: "Paste a link instead" }).click()
    const dialog = page.getByRole("dialog")
    const field = dialog.locator("#manual-url")
    await field.click()
    await field.pressSequentially(URL_TYPED)

    await dialog.getByRole("button", { name: /Reference doc/ }).click()

    await expect(dialog.getByText(/won.t generate upkeep/)).toBeVisible() // the tap landed
    await expect(dialog.getByText("Manual link added")).toBeVisible() // then the link was chosen
  })

  test("a PARTIAL link stays in the field when you leave it", async ({ page }) => {
    await page.goto(`/items/${itemId}`)
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
    await page.getByRole("button", { name: "Paste a link instead" }).click()
    const dialog = page.getByRole("dialog")
    const field = dialog.locator("#manual-url")
    await field.click()
    await field.pressSequentially("https://lg.exa")

    await dialog.getByRole("heading", { name: "Add the manual" }).click()

    await expect(field).toHaveValue("https://lg.exa")
    await expect(dialog.getByText("Manual link added")).toHaveCount(0)
  })

  test("leaving the field — a tap on the dialog's empty space — finishes a typed link", async ({ page }) => {
    await page.goto(`/items/${itemId}`)
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
    await page.getByRole("button", { name: "Paste a link instead" }).click()
    const dialog = page.getByRole("dialog")
    const field = dialog.locator("#manual-url")
    await field.click()
    await field.pressSequentially(URL_TYPED)
    await expect(field).toHaveValue(URL_TYPED)
    await expect(dialog.getByText("Manual link added")).toHaveCount(0)

    // The dialog's heading: not a control, so the press is "somewhere else".
    await dialog.getByRole("heading", { name: "Add the manual" }).click()

    await expect(dialog.getByText("Manual link added")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Scan the manual" })).toBeEnabled()
  })
})
