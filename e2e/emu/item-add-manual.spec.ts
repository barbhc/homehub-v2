import { test, expect, type Page } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "../seed-config"

/**
 * HH-159 — "Add the manual" on the item page, from a name-only item, at phone
 * width AND at desktop width (this config defaults to desktop only).
 *
 * Three bugs met on this screen:
 *  - the page mounted its phone tree AND its desktop tree, CSS hiding one. Each
 *    tree renders its own ManualSection, whose dialog is portaled out from
 *    under the `display:none`, so one tap opened TWO dialogs;
 *  - the dialog's confirm handler read the chosen file from a stale closure,
 *    so the first attempt from every door failed — "Enter a URL" after picking
 *    a PDF from the Upkeep door, "Select a PDF file" from the drop-zone;
 *  - the page re-enqueued any unread manual under ten minutes old when it
 *    loaded, so coming back to the item paid for the scan again.
 *
 * Counting rules (CLAUDE.md rule 3): dialogs and headings are counted with
 * `includeHidden` and no visibility filter, because the claim is "not
 * RENDERED", not "not shown" — Radix marks everything outside an open dialog
 * aria-hidden, which is exactly how a second dialog hides from a plain
 * getByRole count. The parse callable is stubbed at the network layer; this
 * pins the client, not the worker.
 */
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")

/** Every role=dialog in the DOM, hidden or not. */
const allDialogs = (page: Page) => page.getByRole("dialog", { includeHidden: true })

async function stubEnqueue(page: Page): Promise<{ count: () => number }> {
  let calls = 0
  await page.route("**/enqueueParse", (route) => {
    calls += 1
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { ok: true, requestId: `req-item-add-${calls}` } }),
    })
  })
  return { count: () => calls }
}

/** The page's manual-URL reads (getDownloadURL on the uploaded PDF) — the last
 *  step of the item page's load, and the moment the old re-enqueue fired. */
function countManualUrlReads(page: Page): () => number {
  let reads = 0
  page.on("response", (res) => {
    const u = res.url()
    if (res.request().method() === "GET" && u.includes("/o/homes%2F") && u.includes("manual_")) reads += 1
  })
  return () => reads
}

/** A name-only item through the simple lane — no manual, so the item page
 *  offers "Add the manual" in Upkeep and the drop-zone in the manual section. */
async function addNameOnlyItem(page: Page, name: string) {
  await page.goto("/inventory/add")
  await page.getByRole("button", { name: /Everything else/ }).click()
  await page.locator("#identify-name").fill(name)
  await page.getByRole("button", { name: /^Add item$/ }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/items\//, { timeout: 20_000 })
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
  // One tree: the item's heading is in the DOM once, not once per layout.
  await expect(page.getByRole("heading", { name, exact: true, includeHidden: true })).toHaveCount(1)
  // Nothing is open yet — the baseline the counts below are measured from.
  await expect(allDialogs(page)).toHaveCount(0)
}

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

/** The dialog is open, alone, and a PDF goes in → Scan → it closes itself. */
async function scanAPdfFromTheOpenDialog(page: Page) {
  await expect(allDialogs(page)).toHaveCount(1)
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Add the manual" })).toBeVisible()
  const sawError = await watchForText(page, ["Enter a URL", "Select a PDF file"])

  await dialog.locator('input[type="file"]').setInputFiles({
    name: "manual.pdf",
    mimeType: "application/pdf",
    buffer: TINY_PDF,
  })
  await dialog.getByRole("button", { name: "Scan the manual" }).click()

  // Success is the dialog closing itself: upload → manual doc → scan started.
  await expect(allDialogs(page)).toHaveCount(0, { timeout: 30_000 })
  expect(await sawError()).toEqual([])
  await expect(page.getByText("Enter a URL")).toHaveCount(0)
  await expect(page.getByText("Select a PDF file")).toHaveCount(0)
  // …and the manual is really there.
  await expect(page.getByRole("button", { name: /Manuals & References\s*\(1\)/ })).toBeVisible({ timeout: 10_000 })
}

function describeAt(label: string, viewport: { width: number; height: number }) {
  test.describe(`item page — add the manual (${label})`, () => {
    test.use({ viewport })

    test("the Upkeep door: one dialog, first tap works, one scan — and coming back does not scan again", async ({ page }) => {
      const enqueue = await stubEnqueue(page)
      const manualUrlReads = countManualUrlReads(page)
      const name = `Upkeep Door ${label} ${Date.now()}`
      await addNameOnlyItem(page, name)

      await page.getByRole("button", { name: "Add the manual", exact: true }).click()
      await scanAPdfFromTheOpenDialog(page)
      await page.waitForTimeout(1_500)
      expect(enqueue.count()).toBe(1)

      // Come back to the item: the page loads the manual (unread, seconds old)
      // and must only WATCH it. The old page re-enqueued it right after
      // resolving its URL, so wait for that read and then give it time.
      const readsBefore = manualUrlReads()
      await page.reload()
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 })
      await expect.poll(manualUrlReads, { timeout: 20_000 }).toBeGreaterThan(readsBefore)
      await page.waitForTimeout(3_000)
      expect(enqueue.count()).toBe(1)
      await expect(page.getByRole("heading", { name, exact: true, includeHidden: true })).toHaveCount(1)
    })

    test("the drop-zone door: one dialog, first tap works, one scan", async ({ page }) => {
      const enqueue = await stubEnqueue(page)
      const name = `Drop Zone ${label} ${Date.now()}`
      await addNameOnlyItem(page, name)

      // The drop-zone lives in the manual section, which starts collapsed.
      await page.getByRole("button", { name: /Manuals & References\s*\(0\)/ }).click()
      await page.getByRole("button", { name: /Upload the manual/ }).click()
      await scanAPdfFromTheOpenDialog(page)
      await page.waitForTimeout(1_500)
      expect(enqueue.count()).toBe(1)
      await expect(page.getByRole("heading", { name, exact: true, includeHidden: true })).toHaveCount(1)
    })
  })
}

describeAt("390px", { width: 390, height: 844 })
describeAt("desktop", DESKTOP_VIEWPORT)
