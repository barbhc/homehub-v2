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
  await expect(page.getByRole("button", { name: "Snap label instead" }).filter(visible).first()).toBeVisible()
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
    await expect(page.locator("#identify-name")).toHaveValue("Coway AP-1512HH")
    await expect(page.locator("#identify-brand")).toHaveValue("Coway")
    await expect(page.locator("#identify-model")).toHaveValue("AP-1512HH")
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
    await expect(page.getByText("Couldn't read details from this photo", { exact: false })).toBeVisible({ timeout: 10_000 })
    await page.getByText("Show text found on the label").click()
    await expect(page.getByText("S/N QX44-778812", { exact: false })).toBeVisible()
    // No field was invented from nothing (the old code minted "Appliance").
    await expect(page.locator("#identify-name")).toHaveValue("")
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
