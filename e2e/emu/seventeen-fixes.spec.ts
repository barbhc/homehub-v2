import { test, expect, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { DESKTOP_VIEWPORT, EMULATOR_PROJECT_ID, SEED_TODAY, dayOffset } from "../seed-config"

/**
 * Seventeen fixes, PR 1 — the snoozed task page (mock m1) and Home's zip row
 * with its zip screens (mock m5), against the real emulators. Both cross a
 * serialization boundary the unit tests mock: the task page reads `status` and
 * `snoozedUntil` off the stored occurrence, and the zip screens write the home
 * doc and the prefs doc. So each is read back from Firestore.
 *
 * The browser clock is fixed at noon on the seed's today (as e2e/fixtures.ts
 * does for the journeys), so "Snoozed until Jul 7" is deterministic.
 * Counting (CLAUDE.md rule 3): "not rendered" is toHaveCount(0).
 */
const HOME = "e2e-home"
const SHOTS = process.env.SEVENTEEN_SHOTS_DIR ?? "test-results/seventeen"
const NOON = new Date(`${SEED_TODAY}T12:00:00-07:00`)
const visible = { visible: true } as const

function emulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set — this spec writes to the EMULATOR only")
  }
  return getFirestore(getApps()[0] ?? initializeApp({ projectId: EMULATOR_PROJECT_ID }))
}
const shoot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

const VIEWPORTS = [
  { label: "390", viewport: { width: 390, height: 844 } },
  { label: "desktop", viewport: DESKTOP_VIEWPORT },
] as const

// ── m1: a snoozed task's page ────────────────────────────────────────────────

const UNTIL = dayOffset(14) // Jul 7
const UNTIL_WORDS = "Jul 7"

async function seedSnoozedTask(db: Firestore, id: string) {
  const now = Timestamp.now()
  await db.doc(`homes/${HOME}/taskTemplates/tpl-${id}`).set({
    scopeType: "home", itemUnitId: null, roomId: null, title: "Replace the air filter (snoozed walk)", description: null,
    careType: "maintenance", priorityTier: "essential", remindEnabled: true, riskLevel: "prevent_damage", estimatedMinutes: 10,
    justification: "A clogged filter strains the blower and cuts efficiency.", instructionsOverride: null, steps: null, sourcePage: null,
    supplies: [], source: "cho_generated", isActive: true, metadata: {}, manualId: null, externalKey: null,
    schedule: { scheduleType: "monthly", intervalDays: null, anchorDate: SEED_TODAY, season: null, windowDaysBefore: 7, windowDaysAfter: 14 },
    createdAt: now, updatedAt: now, deletedAt: null,
  })
  await db.doc(`homes/${HOME}/taskInstances/${id}`).set({
    taskTemplateId: `tpl-${id}`, itemUnitId: null, status: "snoozed", dueDate: dayOffset(-1), snoozedUntil: UNTIL,
    windowStart: null, windowEnd: null, priorityScore: 100, isSafetyCritical: false,
    completedAt: null, completionNotes: null, completionPhotos: [], assignedTo: null,
    title: "Replace the air filter (snoozed walk)", priorityTier: "essential", careType: "maintenance", scopeType: "home",
    estimatedMinutes: 10, scheduleType: "monthly", itemName: null, roomName: null,
    createdAt: now, updatedAt: now, deletedAt: null,
  })
}
async function clearTask(db: Firestore, id: string) {
  await db.doc(`homes/${HOME}/taskInstances/${id}`).delete()
  await db.doc(`homes/${HOME}/taskTemplates/tpl-${id}`).delete()
}

for (const colorScheme of ["light", "dark"] as const) for (const { label, viewport } of VIEWPORTS) {
  test.describe(`m1 — a snoozed task's page (${label}, ${colorScheme})`, () => {
    test.use({ viewport, colorScheme, timezoneId: "America/Los_Angeles" })
    const id = `inst-snoozed-${label}-${colorScheme}`
    let db: Firestore
    test.beforeEach(async () => { db = emulatorDb(); await clearTask(db, id); await seedSnoozedTask(db, id) })
    test.afterEach(async () => { await clearTask(db, id) })

    test("says Snoozed until and Paused until; Unsnooze sits beside Mark done and puts it back with its due date", async ({ page }) => {
      await page.clock.setFixedTime(NOON)
      const title = "Replace the air filter (snoozed walk)"
      // Snoozed: off the Tasks list.
      await page.goto("/maintenance")
      await expect(page.getByText("Tasks", { exact: true }).filter(visible).first()).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(1_500)
      await expect(page.getByText(title).filter(visible)).toHaveCount(0)
      await page.goto(`/tasks/${id}`)
      await expect(page.getByText(`Snoozed until ${UNTIL_WORDS}`).filter(visible).first()).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(/Good to do now/)).toHaveCount(0)
      await expect(page.getByTestId("reminder-line").filter(visible).first()).toHaveText(`Paused until ${UNTIL_WORDS}`)
      // The lane on screen: Mark done (filled) and Unsnooze (outlined), the same size.
      const unsnooze = page.getByRole("button", { name: "Unsnooze" }).filter(visible).first()
      const markDone = page.getByRole("button", { name: /Mark done/ }).filter(visible).first()
      await expect(unsnooze).toBeVisible()
      const [u, m] = [await unsnooze.boundingBox(), await markDone.boundingBox()]
      expect(Math.abs(u!.width - m!.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(u!.height - m!.height)).toBeLessThanOrEqual(1)
      expect(u!.height).toBeGreaterThanOrEqual(44)
      await shoot(page, `m1-snoozed-${label}-${colorScheme}`)

      await unsnooze.click()
      await expect(page.getByRole("button", { name: "Unsnooze" })).toHaveCount(0, { timeout: 20_000 })
      await expect(page.getByText(/Snoozed until/)).toHaveCount(0)
      const inst = (await db.doc(`homes/${HOME}/taskInstances/${id}`).get()).data() ?? {}
      // The Undo write: back on the list, its own due date untouched.
      expect(inst).toMatchObject({ status: "scheduled", snoozedUntil: null, dueDate: dayOffset(-1) })
      await shoot(page, `m1-unsnoozed-${label}-${colorScheme}`)
      // Back on the Tasks list.
      await page.goto("/maintenance")
      await expect(page.getByText(title).filter(visible).first()).toBeVisible({ timeout: 20_000 })
    })
  })
}

// ── m5: Home's zip row and the zip screens ──────────────────────────────────

const PREFS = (uid: string) => `users/${uid}/private/preferences`
const ZIP_FIELDS = ["zip", "area", "climate", "climateSource", "freezeRisk"] as const

async function ownerUid(db: Firestore): Promise<string> {
  const members = await db.collection(`homes/${HOME}/members`).where("role", "==", "owner").get()
  const uid = members.docs[0]?.id
  if (!uid) throw new Error("the seeded home has no owner")
  return uid
}
async function resetZip(db: Firestore, uid: string) {
  const del = Object.fromEntries(ZIP_FIELDS.map((f) => [f, FieldValue.delete()]))
  await db.doc(`homes/${HOME}`).set(del, { merge: true })
  // The answer the list's question saves (a dotted path needs update(), not set-merge).
  await db.doc(`homes/${HOME}`).update({ "careFacts.has_water_heater": FieldValue.delete() })
  await db.doc(PREFS(uid)).set({ zip_row_dismissed: FieldValue.delete() }, { merge: true })
  // Any task the walk added from the zip's list.
  const added = await db.collection(`homes/${HOME}/taskTemplates`).where("externalKey", "==", "library:home.quake_straps").get()
  for (const d of added.docs) {
    const inst = await db.collection(`homes/${HOME}/taskInstances`).where("taskTemplateId", "==", d.id).get()
    for (const i of inst.docs) await i.ref.delete()
    await d.ref.delete()
  }
}

for (const colorScheme of ["light", "dark"] as const) for (const { label, viewport } of VIEWPORTS) {
  test.describe(`m5 — Add your zip (${label}, ${colorScheme})`, () => {
    test.use({ viewport, colorScheme, timezoneId: "America/Los_Angeles" })
    let db: Firestore
    let uid: string
    test.beforeEach(async () => { db = emulatorDb(); uid = await ownerUid(db); await resetZip(db, uid) })
    test.afterEach(async () => { await resetZip(db, uid) })

    test("the row under Next up opens the zip screens; the zip lands on THIS home and the row is gone", async ({ page }) => {
      await page.clock.setFixedTime(NOON)
      await page.goto("/home")
      const row = page.getByTestId("zip-row").filter(visible).first()
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row).toContainText("Add your zip")
      await expect(row).toContainText("Get the tasks that matter for your weather and area.")
      await expect(page.getByText("Finish your home profile")).toHaveCount(0)
      // Below Next up.
      const nextUp = page.getByTestId("next-up").filter(visible).first()
      expect((await row.boundingBox())!.y).toBeGreaterThan((await nextUp.boundingBox())!.y)
      // The ✕ is a 44pt target.
      const x = row.getByRole("button", { name: "Not now" })
      const xb = await x.boundingBox()
      expect(xb!.width).toBeGreaterThanOrEqual(44)
      expect(xb!.height).toBeGreaterThanOrEqual(44)
      await row.scrollIntoViewIfNeeded()
      await shoot(page, `m5-home-${label}-${colorScheme}`)

      await row.getByRole("link").click()
      await expect(page).toHaveURL(/\/home\/zip$/)
      await page.getByLabel("Zip code").fill("94110")
      await shoot(page, `m5-zip-${label}-${colorScheme}`)
      await page.getByRole("button", { name: /^Continue$/ }).click()
      await expect(page.getByText("What your area means for upkeep")).toBeVisible({ timeout: 20_000 })
      // The seeded home is a house: no home-type question.
      await expect(page.getByRole("radiogroup", { name: "Home type" })).toHaveCount(0)
      await shoot(page, `m5-area-${label}-${colorScheme}`)
      await page.getByRole("button", { name: "See this month" }).click()
      await expect(page.getByText("Worth doing this month")).toBeVisible({ timeout: 20_000 })
      // June in SF the zip brings ONE thing the home doesn't have: the quake
      // straps. Nothing the home is offered without a zip (smoke alarms, air
      // filter) and nothing it already has (it has a water heater flush).
      const rows = page.getByTestId("first-list-row")
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText("Check the water heater's quake straps")
      await shoot(page, `m5-list-${label}-${colorScheme}`)
      // No account sheet, ever; nothing added before Add.
      await expect(page.getByText("Keep your list")).toHaveCount(0)
      expect((await db.collection(`homes/${HOME}/taskTemplates`).where("externalKey", "==", "library:home.quake_straps").get()).size).toBe(0)
      // Its question first: Yes picks it.
      await rows.first().getByRole("radio", { name: "Yes" }).click()
      await page.getByRole("button", { name: "Add 1 task" }).click()
      await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 })

      const home = (await db.doc(`homes/${HOME}`).get()).data() ?? {}
      expect(home).toMatchObject({ zip: "94110", climateSource: "zip", homeType: "house" })
      expect(home.area).toMatchObject({ county: "San Francisco County" })
      expect(home.careFacts).toMatchObject({ has_water_heater: true })
      // The one picked task, on THIS home — no second home was made.
      expect((await db.collection(`homes/${HOME}/taskTemplates`).where("externalKey", "==", "library:home.quake_straps").get()).size).toBe(1)
      await expect(page.getByTestId("next-up").filter(visible).first()).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId("zip-row")).toHaveCount(0)
    })

    test("✕ is saved with her account for this home and the row does not come back", async ({ page }) => {
      await page.clock.setFixedTime(NOON)
      await page.goto("/home")
      const row = page.getByTestId("zip-row").filter(visible).first()
      await expect(row).toBeVisible({ timeout: 20_000 })
      await row.getByRole("button", { name: "Not now" }).click()
      await expect(page.getByTestId("zip-row")).toHaveCount(0)
      await expect.poll(async () => (await db.doc(PREFS(uid)).get()).data()?.zip_row_dismissed, { timeout: 10_000 }).toEqual([HOME])
      // A fresh device: the local mirror is gone, the server still says no.
      await page.evaluate((key) => window.localStorage.removeItem(key), `hh.zipRow.dismissed.${uid}.${HOME}`)
      await page.reload()
      await expect(page.getByTestId("next-up").filter(visible).first()).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(1_500)
      await expect(page.getByTestId("zip-row")).toHaveCount(0)
    })
  })
}
