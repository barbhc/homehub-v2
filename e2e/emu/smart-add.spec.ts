import { test, expect, type Page } from "@playwright/test"

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
  // The three photo/library alternatives sit behind one disclosure. Its label
  // has now been renamed TWICE and broken this helper both times: "Snap label
  // instead" -> "Snap the label" (PR #89), then "Find the model another way" ->
  // "Can't find the model?" (round 11, to the approved copy). Both times the
  // rename was verified in the unit copy-contract and in the journey walk, and
  // both times this file — the only other place the string lives — was missed.
  //
  // Matched on the STABLE half now: whatever the disclosure is called, it is the
  // control that reveals "Snap the label", so anchor on the thing that does not
  // move rather than on the words above it.
  await page.getByRole("button", { name: /find the model|can'?t find the model/i }).click()
  await expect(page.getByRole("button", { name: /Snap the label/ }).filter(visible).first()).toBeVisible()
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
    await expect(page.getByText(/Filled \d+ fields? from your photo/)).toBeVisible({ timeout: 10_000 })
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
    expect(enqueued).toBeGreaterThan(0)
    // The item page renders a mobile and a desktop tree; .first() can land on
    // the one the breakpoint hides.
    await expect(page.getByText("Emu PR1-9000").filter(visible).first()).toBeVisible({ timeout: 15_000 })

    // The user is never shown a Reading screen or a Purchase step again.
    await expect(page.getByText(/Reading the manual — this takes a minute/)).toHaveCount(0)
    await expect(page.getByText("Purchase Details")).toHaveCount(0)

    // What the pickup card then SAYS is the item page's contract, and it reads
    // a parse stage the stubbed callable never writes — asserting it here would
    // only be testing the stub.
  })
})
