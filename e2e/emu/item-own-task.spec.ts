import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { DESKTOP_VIEWPORT, EMULATOR_PROJECT_ID } from "../seed-config"

/**
 * Seventeen fixes, mock m4 (owner-approved 2026-11-25): an item she named
 * herself, against the real emulators at 390px and desktop, light and dark.
 *
 * Quoted must-be-true:
 *  - "An item she named herself, of a kind the library doesn't cover, shows no
 *    chips and no 'Pick what this is'."
 *  - "The card reads 'No typical care for this yet. Add its manual, or add your
 *    own task.'"
 *  - "Add Your Own Task opens the form with this item picked. The saved task
 *    shows on the item's page."
 *  - "Add the Manual is the one filled button."
 *
 * The task's write crosses the URL (?item=) and the service into Firestore, so
 * it is read back from the emulator and seen on the item page after a reload.
 * Counting (CLAUDE.md rule 3): "not rendered" is toHaveCount(0).
 */
const HOME = "e2e-home"
const SHOTS = process.env.OWN_TASK_SHOTS_DIR ?? "test-results/own-task"
const visible = { visible: true } as const

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}

async function seedNamedItem(db: Firestore, itemId: string) {
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/items/${itemId}`).set({
    roomId: null, displayName: "Kitchen faucet", category: "other", itemCategory: null, subType: null,
    brand: null, model: null, status: "active", purchaseDate: null, warrantyDurationMonths: null,
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

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const VIEWPORTS = [
  { label: "390", viewport: { width: 390, height: 844 } },
  { label: "desktop", viewport: DESKTOP_VIEWPORT },
] as const

for (const colorScheme of ["light", "dark"] as const) for (const { label, viewport } of VIEWPORTS) {
  test.describe(`a self-named item (${label}, ${colorScheme})`, () => {
    test.use({ viewport, colorScheme })
    const itemId = `e2e-own-task-${label}-${colorScheme}`
    let db: Firestore

    test.beforeEach(async () => {
      db = emulatorDb()
      await clearItem(db, itemId)
      await seedNamedItem(db, itemId)
    })
    test.afterEach(async () => { await clearItem(db, itemId) })

    test("no chips; Add Your Own Task opens the form with it picked; the saved task is on its page", async ({ page }) => {
      await page.goto(`/items/${itemId}`)
      const card = page.getByTestId("no-upkeep-card").filter(visible).first()
      await expect(card).toContainText("No typical care for this yet. Add its manual, or add your own task.", { timeout: 20_000 })
      await expect(card).toContainText("No upkeep yet")
      // Not rendered: the chips and their lines.
      await expect(page.getByRole("group", { name: "What is it?" })).toHaveCount(0)
      await expect(page.getByText(/Pick what this is/)).toHaveCount(0)
      await expect(page.getByText(/We couldn't tell what this is/)).toHaveCount(0)
      const manual = card.getByRole("button", { name: "Add the Manual", exact: true })
      const own = card.getByRole("link", { name: "Add Your Own Task" })
      await expect(manual).toBeVisible()
      await expect(own).toBeVisible()
      // Stacked, the same width, each a 44pt target; the manual is the filled one.
      const [mb, ob] = [await manual.boundingBox(), await own.boundingBox()]
      expect(mb && ob).toBeTruthy()
      expect(Math.abs(mb!.width - ob!.width)).toBeLessThanOrEqual(1)
      expect(ob!.y).toBeGreaterThan(mb!.y)
      expect(mb!.height).toBeGreaterThanOrEqual(44)
      expect(ob!.height).toBeGreaterThanOrEqual(44)
      const fills = await card.locator("button, a").evaluateAll((els) =>
        els.filter((e) => (e.getAttribute("style") ?? "").includes("--hh-teal-fill")).map((e) => e.textContent))
      expect(fills).toEqual(["Add the Manual"])
      await card.scrollIntoViewIfNeeded()
      await shoot(page, `item-${label}-${colorScheme}`)

      await own.click()
      await expect(page).toHaveURL(new RegExp(`/maintenance/custom\\?item=${itemId}$`))
      const forItem = page.getByTestId("own-task-for-item").filter(visible).first()
      await expect(forItem).toContainText("For Kitchen faucet", { timeout: 20_000 })
      await expect(page.getByRole("radiogroup", { name: "Shows in" })).toHaveCount(0)
      await shoot(page, `form-${label}-${colorScheme}`)

      const title = `Clean the aerator ${label}-${colorScheme}`
      await page.getByLabel("Task name").filter(visible).first().fill(title)
      await page.getByRole("button", { name: "Add task" }).filter(visible).first().click()
      await expect(page.getByRole("status").filter(visible).first()).toContainText(`Added ${title} to Kitchen faucet.`, { timeout: 20_000 })

      // The write, read back from the emulator: an upkeep task ON this item.
      const tpl = await db.collection(`homes/${HOME}/taskTemplates`).where("itemUnitId", "==", itemId).get()
      expect(tpl.size).toBe(1)
      expect(tpl.docs[0].data()).toMatchObject({ title, scopeType: "item_unit", source: "user", careType: "maintenance" })

      // And on the item's page, after a fresh load.
      await page.getByRole("link", { name: "See it there" }).filter(visible).first().click()
      await expect(page).toHaveURL(new RegExp(`/inventory/${itemId}$`))
      await page.reload()
      await expect(page.getByText(title).filter(visible).first()).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId("no-upkeep-card")).toHaveCount(0)
      await shoot(page, `saved-${label}-${colorScheme}`)
    })
  })
}
