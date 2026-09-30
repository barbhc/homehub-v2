import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * Smart Add (P0) against the seeded emulator — proves the flagship add-item flow
 * creates a real Firestore item end-to-end (createItemUnit on
 * homes/{homeId}/items) instead of dead-ending on the legacy inventoryService
 * ("Could not create item" on the inert shim, the audit's P0 bug).
 *
 * Drives the simple lane (Flow A two-lane start): /inventory/add opens the lane
 * chooser → "Everything else" → name → "Add item" → lands on the detail page.
 */
const visible = { visible: true } as const

test.describe("emulator e2e — smart add (createItemUnit P0)", () => {
  test("simple-lane add creates an item and lands on its detail page", async ({ page }) => {
    await page.goto("/inventory/add")

    // Lane chooser → "Everything else" (name-only quick add).
    await page.getByRole("button", { name: /Everything else/ }).click()
    await page.locator("#identify-name").fill("Emu Test Toaster")
    await page.getByRole("button", { name: /^Add item$/ }).filter(visible).first().click()

    // createItemUnit succeeded → navigate to /items/{item_unit_id} and the item
    // detail page renders the new item's name from Firestore.
    await expect(page).toHaveURL(/\/items\//, { timeout: 15_000 })
    await expect(page.getByText("Emu Test Toaster").filter(visible).first()).toBeVisible({ timeout: 15_000 })
  })
})

/**
 * "Snap label instead" OCR states — the callable is stubbed at the network layer
 * (real Vision/Claude need live secrets the emulator doesn't have) so the spec
 * pins the CLIENT contract that was broken in prod: every outcome must be
 * visible in the appliance lane (spinner → filled-count copy / honest empty copy
 * with raw text / error box with retry), never a silent no-op.
 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

const EMPTY_FIELDS = {
  brand: null, model: null, name: null, serialNumber: null, category: null,
  purchaseDate: null, purchasePrice: null,
}

async function snapLabelPhoto(page: Page) {
  await page.goto("/inventory/add")
  // Flow A: the label photo is an assist inside the appliance lane.
  await page.getByRole("button", { name: /Appliance or device/ }).click()
  // HH-123 (round 13): scanning the label came OUT of the disclosure and became
  // a first-class control under the model field, because burying it under
  // "Can't find the model?" framed the camera as what you do after failing.
  // So there is no disclosure to open any more — the control is just there.
  //
  // Anchored on the control itself rather than on anything above it: this
  // helper has been broken by a rename twice before, both times because it
  // depended on the words framing the button rather than the button.
  await expect(page.getByRole("button", { name: /Scan the label/ }).filter(visible).first())
    .toBeVisible({ timeout: 15_000 })
  await page.setInputFiles('input[type="file"]', {
    name: "label.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  })
}

test.describe("emulator e2e — smart add label OCR states", () => {
  test("success: spinner while reading, then honest filled-fields copy + autofill", async ({ page }) => {
    await page.route("**/ocr", async (route) => {
      await new Promise((r) => setTimeout(r, 800)) // hold long enough to assert the spinner
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            ...EMPTY_FIELDS,
            brand: "Coway", model: "AP-1512HH", name: "Coway AP-1512HH", category: "air purifier",
            docType: "nameplate", confidence: 0.9, text: "COWAY MODEL AP-1512HH", engine: "vision",
          },
        }),
      })
    })
    await snapLabelPhoto(page)
    await expect(page.getByText("Reading label…").first()).toBeVisible({ timeout: 5_000 })
    // The scan NAMES what it changed rather than counting fields — the old line
    // ("Filled 4 fields…") counted things the appliance lane never displays and
    // pointed at a disclosure that only exists in the simple lane.
    await expect(page.getByText(/Got the .* from your photo/)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("#identify-brand")).toHaveValue("Coway")
    await expect(page.locator("#identify-model")).toHaveValue("AP-1512HH")
    // Round 11: the appliance lane has no Name field, and OCR deliberately does
    // not set one. A nameplate yields "Coway AP-1512HH" — a part number — and
    // composeItemName keeps any name it is given as the user's own choice, so
    // filling it here would quietly undo HH-112 for every photo-assisted add.
    // The item is named for what it IS, from the category, exactly as when the
    // model is typed by hand.
    await expect(page.locator("#identify-name")).toHaveCount(0)
  })

  test("empty: honest couldn't-read copy with the raw label text expandable", async ({ page }) => {
    await page.route("**/ocr", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            ...EMPTY_FIELDS,
            docType: "unknown", confidence: 0,
            text: "S/N QX44-778812 MADE IN KOREA", engine: "claude-vision",
          },
        }),
      })
    )
    await snapLabelPhoto(page)
    // Copy changed with the capture-guidance work: the bare "try a straight-on
    // shot in good light" line was replaced by an honest sentence plus an
    // ordered tips block, because "straight-on" is actively wrong advice on the
    // glossy foil labels most appliances use.
    await expect(page.getByText("Couldn't read anything usable from that photo", { exact: false })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Get closer/i).first()).toBeVisible()
    await page.getByText("Show text found on the label").click()
    await expect(page.getByText("S/N QX44-778812", { exact: false })).toBeVisible()
    // No field was invented from nothing (the old code minted "Appliance").
    // The appliance lane no longer has a Name input at all; what matters is
    // that a failed read leaves brand and model empty rather than guessing.
    await expect(page.locator("#identify-name")).toHaveCount(0)
    await expect(page.locator("#identify-brand")).toHaveValue("")
    await expect(page.locator("#identify-model")).toHaveValue("")
  })

  test("extraction outage (parseWarning): copy blames the reader, not the photo", async ({ page }) => {
    await page.route("**/ocr", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            ...EMPTY_FIELDS,
            docType: "unknown", confidence: 0,
            text: "BOSCH MODEL SHPM65Z55N/01", engine: "vision",
            parseWarning: "credit balance is too low",
          },
        }),
      })
    )
    await snapLabelPhoto(page)
    await expect(page.getByText("Our label reader is having trouble right now", { exact: false })).toBeVisible({ timeout: 10_000 })
    await page.getByText("Show text found on the label").click()
    await expect(page.getByText("SHPM65Z55N/01", { exact: false })).toBeVisible()
  })

  test("failure: visible error box with retry, no silent no-op", async ({ page }) => {
    await page.route("**/ocr", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Daily AI limit reached — try again tomorrow.", status: "RESOURCE_EXHAUSTED" },
        }),
      })
    )
    await snapLabelPhoto(page)
    await expect(page.getByText("Daily AI limit reached", { exact: false })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: "Try again" }).filter(visible).first()).toBeVisible()
  })
})

/**
 * PR 1 of the living-item-page flow: the wizard's job ends when the manual is
 * attached. It used to park the user on a Reading screen for the couple of
 * minutes the worker takes, then walk them through a review of every bucket.
 *
 * The parse callables are stubbed at the network layer — same technique as the
 * OCR specs above — because this asserts the CLIENT handoff, not the worker.
 */
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")

test.describe("emulator e2e — the wizard ends at the manual", () => {
  test("attaching a manual starts the parse and lands on the item page", async ({ page }) => {
    // The doc-type gate would otherwise interrupt with a "is this a manual?"
    // prompt; a confident manual verdict lets the handoff run.
    await page.route("**/detectDocType", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { docType: "manual", confidence: 0.95, reason: "stub" } }),
      })
    )
    let enqueued = 0
    await page.route("**/enqueueParse", (route) => {
      enqueued += 1
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { ok: true, requestId: "req-e2e-1" } }),
      })
    })
    // The item page resolves the new manual's download URL as the LAST step of
    // its load (six reads, then resolveManualUrl). Counted here so the enqueue
    // assertion below can wait for that moment instead of passing before the
    // page has had its chance to enqueue again.
    let itemPageManualUrlReads = 0
    page.on("response", (res) => {
      const u = res.url()
      if (res.request().method() === "GET" && u.includes("/o/homes%2F") && u.includes("manual_")
        && /\/items\//.test(page.url())) itemPageManualUrlReads += 1
    })

    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()
    await page.locator("#identify-brand").fill("Emu")
    await page.locator("#identify-model").fill("PR1-9000")
    // The appliance lane's CTA names its destination; the simple lane's is
    // "Add item". Round 11 dropped the "Next:" prefix so the button and the
    // title of the screen it opens are the same words.
    await page.getByRole("button", { name: /^Add the manual$/i }).filter(visible).first().click()

    // Step 2 of 2 — and there is no step 3. The heading is the button's words.
    await expect(page.getByRole("heading", { name: /^Add the manual$/i }).filter(visible).first())
      .toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Reading", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Purchase", { exact: true })).toHaveCount(0)

    // The PDF input specifically — the step also carries an image input, and
    // a bare input[type=file] picked the wrong one (button stayed disabled).
    await page.setInputFiles('input[accept*="pdf"]', {
      name: "manual.pdf",
      mimeType: "application/pdf",
      buffer: TINY_PDF,
    })
    // Scan, never parse (jargon) and never read (which would suggest we are
    // opening the manual for the user to read).
    await page.getByRole("button", { name: /Scan the manual/i }).filter(visible).first().click()

    // The handoff: parse enqueued, wizard gone, item page showing.
    await expect(page).toHaveURL(/\/items\//, { timeout: 30_000 })
    await expect(page.getByText("Emu PR1-9000").filter(visible).first()).toBeVisible({ timeout: 15_000 })

    // EXACTLY one scan per add (HH-159). The item page used to re-enqueue the
    // wizard's manual on arrival — its parsed_at is still null and it is under
    // ten minutes old — and enqueueParse charges before it checks anything, so
    // every add with a manual was paid for twice. That second enqueue fired
    // right after the page resolved the manual's URL, so wait for the page to
    // get that far, then give it time to misbehave. Asserting any earlier
    // passes vacuously: `> 0` was true the moment the wizard enqueued.
    await expect.poll(() => itemPageManualUrlReads, { timeout: 20_000 }).toBeGreaterThan(0)
    await page.waitForTimeout(3_000)
    expect(enqueued).toBe(1)

    // The user is never shown a Reading screen or a Purchase step again.
    await expect(page.getByText(/Reading the manual — this takes a minute/)).toHaveCount(0)
    await expect(page.getByText("Purchase Details")).toHaveCount(0)

    // What the pickup card then SAYS is the item page's contract, and it reads
    // a parse stage the stubbed callable never writes — asserting it here would
    // only be testing the stub.
  })
})

/**
 * HH-130. Back from "Add the manual" returns to the brand and model, as the
 * owner asked — and pressing "Add the manual" again used to CREATE a second
 * item, leaving the first orphaned with no manual. Counted in the store (the
 * admin SDK, emulator only) AND on the Items list, because a list that happens
 * to dedupe by name would pass a UI-only check.
 */
async function liveItemsWithModel(model: string): Promise<number> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec reads the EMULATOR only")
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-homehub" })
  const snap = await getFirestore(app).collection("homes/e2e-home/items").where("model", "==", model).get()
  return snap.docs.filter((d) => d.get("deletedAt") == null).length
}

test.describe("emulator e2e — Back from the manual step (HH-130)", () => {
  test("Add the manual → Back → Add the manual again is still ONE item", async ({ page }) => {
    // Unique per run: specs in one run share the seeded home.
    const model = `HH130-${Date.now().toString(36).toUpperCase()}`
    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()
    await page.locator("#identify-brand").fill("Emu")
    await page.locator("#identify-model").fill(model)
    await page.getByRole("button", { name: /^Add the manual$/i }).filter(visible).first().click()
    await expect(page.getByRole("heading", { name: /^Add the manual$/i }).filter(visible).first())
      .toBeVisible({ timeout: 15_000 })
    await expect.poll(() => liveItemsWithModel(model), { timeout: 10_000 }).toBe(1)

    // Back carries the brand and model back to their fields…
    await page.getByRole("button", { name: /^Back$/ }).filter(visible).first().click()
    await expect(page.locator("#identify-brand")).toHaveValue("Emu")
    await expect(page.locator("#identify-model")).toHaveValue(model)

    // …and going forward again is the same item, not a second one.
    await page.getByRole("button", { name: /^Add the manual$/i }).filter(visible).first().click()
    await expect(page.getByRole("heading", { name: /^Add the manual$/i }).filter(visible).first())
      .toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(`For your Emu ${model}.`)).toBeVisible()
    // Give a second create the time it would take to land before counting.
    await page.waitForTimeout(1_500)
    expect(await liveItemsWithModel(model)).toBe(1)

    // The Items list says the same: one row, not two.
    await page.getByRole("button", { name: /I'll add it later/i }).filter(visible).first().click()
    await expect(page).toHaveURL(/\/items\//, { timeout: 15_000 })
    await page.goto("/inventory")
    await expect(page.getByRole("link", { name: new RegExp(model) }).filter(visible).first())
      .toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("link", { name: new RegExp(model) }).filter(visible)).toHaveCount(1)
  })
})

/**
 * HH-154 through the real Storage and Firestore emulators: the same PDF
 * attached twice is ONE manual. The case that happens: the scan fails to
 * start, the file is still selected, and "Scan the manual" is pressed again —
 * which uploads the same bytes to a NEW storage path. The dedupe used to match
 * on that path, so every retry minted a record ("Why is the rice cooker saved
 * 4 times here?"). It now matches on the SHA-256 of the file.
 */
const STORAGE = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199"}/v0/b/demo-homehub.appspot.com/o`

async function liveManualsFor(itemId: string) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec reads the EMULATOR only")
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-homehub" })
  const snap = await getFirestore(app).collection("homes/e2e-home/manuals").where("itemUnitId", "==", itemId).get()
  return snap.docs.filter((d) => d.get("deletedAt") == null).map((d) => d.data())
}

/** Manual PDFs stored for this item, read with the emulator's admin token. */
async function storedPdfsFor(itemId: string): Promise<string[]> {
  const res = await fetch(`${STORAGE}?prefix=${encodeURIComponent("homes/e2e-home/manuals/")}`, {
    headers: { Authorization: "Bearer owner" },
  })
  const body = (await res.json()) as { items?: { name: string }[] }
  return (body.items ?? []).map((o) => o.name).filter((n) => n.includes(`/${itemId}/`))
}

test.describe("emulator e2e — the same PDF twice is one manual (HH-154)", () => {
  test("a scan that failed to start, retried with the same file, leaves ONE manual and ONE file", async ({ page }) => {
    await page.route("**/detectDocType", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { docType: "manual", confidence: 0.95, reason: "stub" } }),
      })
    )
    const scanned: string[] = []
    await page.route("**/enqueueParse", (route) => {
      const sent = route.request().postDataJSON() as { data?: { manualId?: string } } | null
      scanned.push(sent?.data?.manualId ?? "?")
      return scanned.length === 1
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { message: "Couldn't reach the scanner.", status: "INTERNAL" } }),
          })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ result: { ok: true, requestId: "req-hh154" } }),
          })
    })

    await page.goto("/inventory/add")
    await page.getByRole("button", { name: /Appliance or device/ }).click()
    await page.locator("#identify-brand").fill("Emu")
    await page.locator("#identify-model").fill(`HH154-${Date.now().toString(36).toUpperCase()}`)
    await page.getByRole("button", { name: /^Add the manual$/i }).filter(visible).first().click()
    await expect(page.getByRole("heading", { name: /^Add the manual$/i }).filter(visible).first())
      .toBeVisible({ timeout: 15_000 })

    await page.setInputFiles('input[accept*="pdf"]', { name: "manual.pdf", mimeType: "application/pdf", buffer: TINY_PDF })
    await page.getByRole("button", { name: /Scan the manual/i }).filter(visible).first().click()
    await expect(page.getByText("Couldn't reach the scanner.").filter(visible).first()).toBeVisible({ timeout: 20_000 })

    // The same file is still chosen: press Scan again. It uploads the same
    // bytes to a fresh path — the case the path-based dedupe never matched.
    await page.getByRole("button", { name: /Scan the manual/i }).filter(visible).first().click()
    await expect(page).toHaveURL(/\/items\//, { timeout: 30_000 })
    const itemId = new URL(page.url()).pathname.split("/items/")[1]

    const manuals = await liveManualsFor(itemId)
    expect(manuals, "one manual record for the item").toHaveLength(1)
    expect(manuals[0].contentHash).toMatch(/^[0-9a-f]{64}$/)
    // Both scan requests named that one manual — the retry scanned the record
    // the first attempt made, not a copy of it.
    expect(scanned).toHaveLength(2)
    expect(new Set(scanned).size).toBe(1)
    // …and the redundant second upload was removed: one PDF, the record's own.
    const pdfs = await storedPdfsFor(itemId)
    expect(pdfs).toEqual([manuals[0].sourceRef])
  })
})
