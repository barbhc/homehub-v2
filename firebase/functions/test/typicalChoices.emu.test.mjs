/**
 * Before-friends PR D: Replace or Keep Both, driven through the REAL
 * `commitManualDraft` callable (`.run`) against the Firestore emulator.
 *
 * The situation: she added a typical task from the care library ("Clean the
 * dishwasher filter"), then the manual. The manual's "Clean the filter" scores
 * 0.67 against it, so before PR D `commitDraft` silently declined to create it.
 * Her answer now travels with Save (`typicalChoices`) and is applied in the
 * same commit:
 *  - Replace: the manual's task is created; the typical template is inactive
 *    AND deleted (so it stops suppressing later re-reads), its open instance is
 *    gone, its done instance stays, and its key is in the item's dismissedCare.
 *  - Keep Both: both exist and are active.
 *  - No choices (an old client): exactly today's suppression.
 *  - A similarity-only match sends the matcher's default, Keep Both (D11).
 *
 * Every home here is this file's own (prefix `tc-`) and is removed after.
 * Run: `npm run test:worker:emu` (builds lib, wraps emulators:exec).
 */
import { test, after } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { normalizeTaskRow } from "../lib/shared/parse/parseCore.js"
import { commitDraft } from "../lib/firebase/functions/src/parse/commitDraft.js"
import { commitManualDraft, validTypicalChoices } from "../lib/firebase/functions/src/parse/commitManualDraft.js"
import { matchManualToTypical, defaultChoiceFor } from "../lib/shared/care/manualReplaces.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const RUN = `${Date.now()}`
const homes = []
const home = (label) => {
  const id = `tc-${label}-${RUN}`
  homes.push(id)
  return id
}
after(async () => {
  await Promise.all(homes.map((h) => db.recursiveDelete(db.doc(`homes/${h}`))))
})

const UID = "tc-reviewer"
const ITEM = "dish1"
const OLD = Timestamp.fromDate(new Date("2026-05-01T00:00:00Z"))

/** A home with one member, a dishwasher, its manual (draft run `run`), and
 *  the typical tasks given — each with one scheduled and one done instance. */
async function setup(H, { typical = [], run = "run1" } = {}) {
  await db.doc(`homes/${H}`).set({ name: "Typical Home", freezeRisk: true })
  await db.doc(`homes/${H}/members/${UID}`).set({ uid: UID, role: "owner" })
  await db.doc(`homes/${H}/items/${ITEM}`).set({ displayName: "Whirlpool Dishwasher", itemCategory: "dishwasher", dismissedCare: [] })
  await db.doc(`homes/${H}/manuals/m1`).set({ itemUnitId: ITEM, title: "Manual", previewDraft: { chunks: [], tasks: [], requestId: run } })
  for (const t of typical) {
    await db.doc(`homes/${H}/taskTemplates/${t.id}`).set({
      itemUnitId: t.itemUnitId ?? ITEM,
      scopeType: "item_unit",
      title: t.title,
      externalKey: t.externalKey,
      manualId: t.manualId ?? null,
      source: t.source ?? "cho_generated",
      isActive: true,
      deletedAt: null,
      createdAt: OLD,
      updatedAt: OLD,
    })
    for (const status of ["scheduled", "done"]) {
      await db.doc(`homes/${H}/taskInstances/${t.id}-${status}`).set({
        taskTemplateId: t.id,
        itemUnitId: t.itemUnitId ?? ITEM,
        status,
        title: t.title,
        dueDate: "2026-07-01",
        completedAt: status === "done" ? OLD : null,
        deletedAt: null,
        updatedAt: OLD,
      })
    }
  }
}

const DISH_FILTER = { id: "typ-dish", title: "Clean the dishwasher filter", externalKey: "library:dishwasher.filter" }
const WATER_FILTER = { id: "typ-water", title: "Replace the water filter", externalKey: "library:refrigerator.water" }

/** A review row as the sheet sends it (PreviewTask shape). */
const row = (title, over = {}) => ({
  title, description: null, care_type: "maintenance", priority_tier: "recommended", risk_level: "performance",
  estimated_minutes: 10, schedule_type: "monthly", interval_days: null, instructions_text: null,
  symptom_tags: [], re_check_triggers: [], applies_to: [], supplies: [], remind_enabled: null, ...over,
})

const save = (H, tasks, extra = {}) =>
  commitManualDraft.run({ data: { homeId: H, manualId: "m1", chunks: [], tasks, draftRequestId: "run1", ...extra }, auth: { uid: UID } })

const tpl = async (H, id) => db.doc(`homes/${H}/taskTemplates/${id}`).get()
const inst = async (H, id) => db.doc(`homes/${H}/taskInstances/${id}`).get()
const manualTasks = async (H) =>
  (await db.collection(`homes/${H}/taskTemplates`).where("manualId", "==", "m1").get()).docs

test("Replace: the manual's task is created and the typical task retires in the same commit", async () => {
  const H = home("replace")
  await setup(H, { typical: [DISH_FILTER] })
  const res = await save(H, [row("Clean the filter")], {
    typicalChoices: [{ title: "Clean the filter", templateId: DISH_FILTER.id, choice: "replace" }],
  })
  assert.equal(res.ok, true)
  assert.equal(res.typicalReplaced, 1)

  const created = await manualTasks(H)
  assert.deepEqual(created.map((d) => d.get("title")), ["Clean the filter"])
  assert.equal(created[0].get("isActive"), true)

  const typical = await tpl(H, DISH_FILTER.id)
  assert.equal(typical.get("isActive"), false)
  assert.ok(typical.get("deletedAt") instanceof Timestamp, "deletedAt set — it stops suppressing later re-reads")
  assert.equal(typical.get("replacedByManualId"), "m1")
  assert.ok((await inst(H, `${DISH_FILTER.id}-scheduled`)).get("deletedAt") instanceof Timestamp, "open date soft-deleted")
  const done = await inst(H, `${DISH_FILTER.id}-done`)
  assert.equal(done.get("deletedAt"), null, "a done date is history and stays")
  assert.equal(done.get("title"), DISH_FILTER.title, "and still names its task")
  assert.deepEqual((await db.doc(`homes/${H}/items/${ITEM}`).get()).get("dismissedCare"), ["dishwasher.filter"])
})

test("Keep Both: both tasks exist and are active", async () => {
  const H = home("keep")
  await setup(H, { typical: [DISH_FILTER] })
  const res = await save(H, [row("Clean the filter")], {
    typicalChoices: [{ title: "Clean the filter", templateId: DISH_FILTER.id, choice: "keep_both" }],
  })
  assert.equal(res.ok, true)
  assert.equal(res.typicalReplaced, 0)
  assert.deepEqual((await manualTasks(H)).map((d) => [d.get("title"), d.get("isActive")]), [["Clean the filter", true]])
  const typical = await tpl(H, DISH_FILTER.id)
  assert.equal(typical.get("isActive"), true)
  assert.equal(typical.get("deletedAt"), null)
  assert.equal((await inst(H, `${DISH_FILTER.id}-scheduled`)).get("deletedAt"), null)
  assert.deepEqual((await db.doc(`homes/${H}/items/${ITEM}`).get()).get("dismissedCare"), [])
})

test("No choices (an old client): exactly today's suppression — the typical task stays, the manual's is skipped", async () => {
  const H = home("none")
  await setup(H, { typical: [DISH_FILTER] })
  const res = await save(H, [row("Clean the filter"), row("Run a cleaning cycle")])
  assert.equal(res.ok, true)
  assert.deepEqual((await manualTasks(H)).map((d) => d.get("title")), ["Run a cleaning cycle"])
  assert.equal((await tpl(H, DISH_FILTER.id)).get("isActive"), true)
  assert.equal((await tpl(H, DISH_FILTER.id)).get("deletedAt"), null)

  // And the count is said, not silent: the same commit, one level down.
  const H2 = home("none-count")
  await setup(H2, { typical: [DISH_FILTER] })
  const item = { itemUnitId: ITEM, item_category: "dishwasher", sub_type: null, display_name: "Dishwasher", model: null, accessories: [] }
  const direct = await commitDraft(db, {
    homeId: H2, manualId: "m1", item, requestId: "direct-1", chunks: [],
    tasks: [normalizeTaskRow(row("Clean the filter"))], now: new Date("2026-06-23T00:00:00Z"),
  })
  assert.equal(direct.duplicatesSkipped, 1)
  assert.equal(direct.inserted, 0)
})

test("A similarity-only match sends the matcher's default, Keep Both (D11), and nothing is retired", async () => {
  const H = home("similar")
  await setup(H, { typical: [WATER_FILTER] })
  const title = "Replace water inlet hoses"
  const [m] = matchManualToTypical([title], [{ templateId: WATER_FILTER.id, title: WATER_FILTER.title, libraryKey: "refrigerator.water" }])
  assert.equal(m.by, "similarity")
  const choice = defaultChoiceFor(m.by)
  assert.equal(choice, "keep_both")
  const res = await save(H, [row(title)], { typicalChoices: [{ title, templateId: WATER_FILTER.id, choice }] })
  assert.equal(res.ok, true)
  assert.deepEqual((await manualTasks(H)).map((d) => d.get("title")), [title])
  assert.equal((await tpl(H, WATER_FILTER.id)).get("isActive"), true)
})

test("A choice naming a non-library or another item's template is ignored: today's suppression applies", async () => {
  const H = home("forged")
  const ownTask = { id: "own-task", title: "Clean the dishwasher filter", externalKey: null, source: "user" }
  const otherItem = { id: "other-item", title: "Clean the dishwasher filter", externalKey: "library:dishwasher.filter", itemUnitId: "dish2" }
  await setup(H, { typical: [ownTask, otherItem] })
  const res = await save(H, [row("Clean the filter")], {
    typicalChoices: [
      { title: "Clean the filter", templateId: ownTask.id, choice: "replace" },
      { title: "Clean the filter", templateId: otherItem.id, choice: "replace" },
      { title: "Not a row", templateId: "nope", choice: "replace" },
    ],
  })
  assert.equal(res.ok, true)
  assert.equal(res.typicalReplaced, 0)
  assert.deepEqual((await manualTasks(H)).map((d) => d.get("title")), [], "still suppressed by her own task")
  assert.equal((await tpl(H, ownTask.id)).get("isActive"), true)
  assert.equal((await tpl(H, otherItem.id)).get("isActive"), true)
})

test("Replace on a row another task still suppresses does nothing: the item never ends up with neither", async () => {
  const H = home("blocked")
  // A second manual's task with the same wording still suppresses the row.
  const otherManual = { id: "other-manual", title: "Clean the filter", externalKey: "dish1::clean the filter", manualId: "m0", source: "manual" }
  await setup(H, { typical: [DISH_FILTER, otherManual] })
  const res = await save(H, [row("Clean the filter")], {
    typicalChoices: [{ title: "Clean the filter", templateId: DISH_FILTER.id, choice: "replace" }],
  })
  assert.equal(res.ok, true)
  assert.equal(res.typicalReplaced, 0)
  assert.deepEqual((await manualTasks(H)).map((d) => d.get("title")), [])
  assert.equal((await tpl(H, DISH_FILTER.id)).get("isActive"), true, "the typical task is kept")
  assert.equal((await tpl(H, DISH_FILTER.id)).get("deletedAt"), null)
})

test("A re-read after Replace resurrects nothing and duplicates nothing", async () => {
  const H = home("reread")
  await setup(H, { typical: [DISH_FILTER] })
  await save(H, [row("Clean the filter")], {
    typicalChoices: [{ title: "Clean the filter", templateId: DISH_FILTER.id, choice: "replace" }],
  })
  // A new read of the same manual, saved with no choices (nothing matches now).
  await db.doc(`homes/${H}/manuals/m1`).set({ previewDraft: { chunks: [], tasks: [], requestId: "run2" } }, { merge: true })
  const res = await commitManualDraft.run({
    data: { homeId: H, manualId: "m1", chunks: [], tasks: [row("Clean the filter")], draftRequestId: "run2" },
    auth: { uid: UID },
  })
  assert.equal(res.ok, true)
  const mine = await manualTasks(H)
  assert.equal(mine.length, 1, "matched in place, not inserted twice")
  assert.equal(mine[0].get("deletedAt"), null)
  const typical = await tpl(H, DISH_FILTER.id)
  assert.equal(typical.get("isActive"), false)
  assert.ok(typical.get("deletedAt") instanceof Timestamp, "still retired")
})

test("Malformed typicalChoices are refused at the door (Zod), and nothing is written", async () => {
  const H = home("bad")
  await setup(H, { typical: [DISH_FILTER] })
  const code = async (typicalChoices) => {
    try {
      await save(H, [row("Clean the filter")], { typicalChoices })
      return "resolved"
    } catch (e) {
      return e?.code
    }
  }
  assert.equal(await code([{ title: "Clean the filter", templateId: DISH_FILTER.id, choice: "delete" }]), "invalid-argument")
  assert.equal(await code([{ title: "Clean the filter", templateId: "a/b", choice: "replace" }]), "invalid-argument")
  assert.equal(await code("replace"), "invalid-argument")
  assert.deepEqual((await manualTasks(H)).map((d) => d.get("title")), [])
  assert.equal((await tpl(H, DISH_FILTER.id)).get("isActive"), true)
})

test("A choice whose row and template do not match is not honoured (Codex review): nothing is retired", async () => {
  const H = home("mismatch")
  await setup(H, { typical: [WATER_FILTER] })
  const res = await save(H, [row("Run a cleaning cycle")], {
    typicalChoices: [{ title: "Run a cleaning cycle", templateId: WATER_FILTER.id, choice: "replace" }],
  })
  assert.equal(res.ok, true)
  assert.equal(res.typicalReplaced, 0)
  assert.deepEqual((await manualTasks(H)).map((d) => d.get("title")), ["Run a cleaning cycle"])
  assert.equal((await tpl(H, WATER_FILTER.id)).get("isActive"), true)
  assert.equal((await tpl(H, WATER_FILTER.id)).get("deletedAt"), null)
})

test("A typical task changed after it was validated fails the whole save, visibly — nothing half-written", async () => {
  const H = home("raced")
  await setup(H, { typical: [DISH_FILTER] })
  const choices = await validTypicalChoices(db, {
    homeId: H, manualId: "m1", itemUnitId: ITEM, itemExists: true,
    rowTitles: ["Clean the filter"], choices: [{ title: "Clean the filter", templateId: DISH_FILTER.id, choice: "replace" }],
  })
  assert.equal(choices.size, 1)
  // Another member edits the typical task in between.
  await db.doc(`homes/${H}/taskTemplates/${DISH_FILTER.id}`).set({ title: "Clean the filter screen" }, { merge: true })
  const item = { itemUnitId: ITEM, item_category: "dishwasher", sub_type: null, display_name: "Dishwasher", model: null, accessories: [] }
  await assert.rejects(
    commitDraft(db, {
      homeId: H, manualId: "m1", item, requestId: "raced-1", chunks: [],
      tasks: [{ ...normalizeTaskRow(row("Clean the filter")), typical_choice: choices.get(0) }],
      now: new Date("2026-06-23T00:00:00Z"),
    }),
    (e) => e?.code === 9,
  )
  assert.deepEqual((await manualTasks(H)).map((d) => d.get("title")), [], "the manual task was not written either")
  assert.equal((await tpl(H, DISH_FILTER.id)).get("isActive"), true)
  assert.equal((await tpl(H, DISH_FILTER.id)).get("deletedAt"), null)
})
