import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { DESKTOP_VIEWPORT, EMULATOR_PROJECT_ID } from "../seed-config"

/**
 * Before-friends PR C — "What is it?" on the item page's no-manual card (mock
 * r4-m2-nokind), against the real emulators at 390px and desktop, light and
 * dark. Must be true: "An item whose kind is unknown shows the 'What is it?'
 * chips; picking one saves the kind and shows that kind's typical care."
 *
 * The item is written with the admin SDK exactly as the add screen's appliance
 * lane leaves one whose lookup found nothing: named by its "Brand Model"
 * placeholder, category "other", no typed category or sub-type. Everything
 * after that is the page's own write, read back from Firestore and survived a
 * reload (the write crosses a serialization boundary; the unit tests mock it).
 *
 * Counting (CLAUDE.md rule 3): "not rendered" is toHaveCount(0).
 * Screenshots go to $WHAT_IS_IT_SHOTS_DIR (default test-results/…, which git
 * ignores) — for putting beside the mock, not for the repo.
 */
const HOME = "e2e-home"
const SHOTS = process.env.WHAT_IS_IT_SHOTS_DIR ?? "test-results/what-is-it"
const visible = { visible: true } as const

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}

async function seedUnknownItem(db: Firestore, itemId: string) {
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/items/${itemId}`).set({
    roomId: null, displayName: "Bosch SHPM88Z75N", category: "other", itemCategory: null, subType: null,
    brand: "Bosch", model: "SHPM88Z75N", status: "active", purchaseDate: null, warrantyDurationMonths: null,
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
  test.describe(`What is it? on the item page (${label}, ${colorScheme})`, () => {
    test.use({ viewport, colorScheme })
    const itemId = `e2e-what-is-it-${label}-${colorScheme}`
    let db: Firestore

    test.beforeEach(async () => {
      db = emulatorDb()
      await clearItem(db, itemId)
      await seedUnknownItem(db, itemId)
    })
    test.afterEach(async () => { await clearItem(db, itemId) })

    test("an unidentified item: the chips; Washer files it, renames it, and its typical care shows — after a reload too", async ({ page }) => {
      await page.goto(`/items/${itemId}`)
      const card = page.getByTestId("no-upkeep-card").filter(visible).first()
      const group = card.getByRole("group", { name: "What is it?" })
      await expect(group).toBeVisible({ timeout: 20_000 })

      // Before: the mock's card.
      await expect(card).toContainText("No upkeep yet")
      await expect(card).toContainText("We couldn't tell what this is from its model. Pick one to see its typical care.")
      await expect(group.getByRole("button")).toHaveText(["Dishwasher", "Washer", "Dryer", "Fridge", "Furnace"])
      await expect(card).toContainText("Or add the manual for the exact schedule.")
      await expect(card.getByRole("button", { name: "Add the Manual", exact: true })).toBeVisible()
      // Every chip a 44pt target.
      for (const box of await group.getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
        expect(box).toBeGreaterThanOrEqual(44)
      }
      await card.scrollIntoViewIfNeeded()
      await shoot(page, `before-${label}-${colorScheme}`)

      await group.getByRole("button", { name: "Washer", exact: true }).click()

      // After: the page re-reads the item and the card shows washers' care.
      await expect(card).toContainText("Here's what most washers need. Add the manual for this one's exact schedule.", { timeout: 20_000 })
      await expect(card.getByTestId("suggested-card-row").first()).toContainText("Run a tub-clean cycle")
      await expect(page.getByRole("group", { name: "What is it?" })).toHaveCount(0)
      await expect(page.getByRole("heading", { name: "Washer", exact: true }).filter(visible)).toBeVisible()
      await card.scrollIntoViewIfNeeded()
      await shoot(page, `after-${label}-${colorScheme}`)

      // The write itself, read back from the emulator.
      const doc = (await db.doc(`homes/${HOME}/items/${itemId}`).get()).data() ?? {}
      expect(doc).toMatchObject({ itemCategory: "major_appliance", subType: "washing-machine", category: "washing-machine", displayName: "Washer", brand: "Bosch", model: "SHPM88Z75N" })
      // Nothing scheduled by the pick: no task exists until she taps Add.
      const tasks = await db.collection(`homes/${HOME}/taskTemplates`).where("itemUnitId", "==", itemId).get()
      expect(tasks.size).toBe(0)

      await page.reload()
      const again = page.getByTestId("no-upkeep-card").filter(visible).first()
      await expect(again).toContainText("Here's what most washers need.", { timeout: 20_000 })
      await expect(page.getByRole("group", { name: "What is it?" })).toHaveCount(0)
    })
  })
}
