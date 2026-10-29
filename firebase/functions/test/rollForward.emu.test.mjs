/**
 * rollForwardNeverStarted integration test — drives runRollForward against the
 * Firestore emulator. Verifies v1's semantics: never-started recurring past-due
 * instances re-anchor to the next cycle from today; a template with ANY completed
 * sibling keeps its real overdue date; non-recurring types are left alone.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runRollForward } from "../lib/firebase/functions/src/schedule/rollForward.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()
const TODAY = "2026-06-23"
const PAST = "2026-05-01"
const NOW = Timestamp.fromDate(new Date(`${TODAY}T00:00:00Z`))

async function tpl(H, id, scheduleType, intervalDays = null) {
  await db.doc(`homes/${H}/taskTemplates/${id}`).set({ schedule: { scheduleType, intervalDays }, deletedAt: null })
}
async function inst(H, id, templateId, { status = "scheduled", dueDate = PAST, ...extra } = {}) {
  await db.doc(`homes/${H}/taskInstances/${id}`).set({ taskTemplateId: templateId, status, dueDate, deletedAt: null, updatedAt: NOW, ...extra })
}

test("re-anchors a never-started recurring past-due instance to next cycle", async () => {
  const H = "rf-basic"
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1")
  const res = await runRollForward(db, TODAY)
  assert.equal(res.rolled, 1)
  const due = (await db.doc(`homes/${H}/taskInstances/i1`).get()).get("dueDate")
  assert.equal(due, "2026-07-23") // today + 1 month
})

test("leaves a lapsed task (has a completed sibling) at its real overdue date", async () => {
  const H = "rf-hasdone"
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1") // past-due, scheduled
  await inst(H, "done1", "t1", { status: "done", dueDate: PAST })
  const res = await runRollForward(db, TODAY)
  assert.equal(res.skippedHasDone >= 1, true)
  const due = (await db.doc(`homes/${H}/taskInstances/i1`).get()).get("dueDate")
  assert.equal(due, PAST) // untouched
})

test("does not roll non-recurring (seasonal/as_needed/setup)", async () => {
  const H = "rf-nonrec"
  await tpl(H, "t1", "seasonal")
  await inst(H, "i1", "t1")
  const res = await runRollForward(db, TODAY)
  assert.equal(res.skippedNonRecurring >= 1, true)
  const due = (await db.doc(`homes/${H}/taskInstances/i1`).get()).get("dueDate")
  assert.equal(due, PAST)
})

test("writes in chunks: every rollable instance lands, however many batches it takes (C8)", async () => {
  // The job used to put every re-anchored instance in the app into ONE batch;
  // Firestore refuses more than 500 writes in a batch, so the first night with
  // 501 rollable rows would roll none — and every night after. A batch size of
  // 2 stands in for the real 400 so the test stays fast.
  const H = "rf-chunked"
  await tpl(H, "t1", "monthly")
  for (let i = 0; i < 5; i++) await inst(H, `c${i}`, "t1")
  const res = await runRollForward(db, TODAY, { batchSize: 2 })
  for (let i = 0; i < 5; i++) {
    const due = (await db.doc(`homes/${H}/taskInstances/c${i}`).get()).get("dueDate")
    assert.equal(due, "2026-07-23", `c${i} must be rolled`)
  }
  assert.ok(res.rolled >= 5)
  assert.equal(res.batches, Math.ceil(res.rolled / 2), "one commit per full chunk, plus the remainder")
})

test("nothing to roll commits nothing", async () => {
  const res = await runRollForward(db, "1970-01-01")
  assert.equal(res.rolled, 0)
  assert.equal(res.batches, 0)
})

test("ignores instances that are not past-due", async () => {
  const H = "rf-future"
  await tpl(H, "t1", "weekly")
  await inst(H, "i1", "t1", { dueDate: "2026-07-01" }) // future
  const res = await runRollForward(db, TODAY)
  // This home contributes nothing; the future instance is never scanned.
  const due = (await db.doc(`homes/${H}/taskInstances/i1`).get()).get("dueDate")
  assert.equal(due, "2026-07-01")
  assert.ok(res.scanned >= 0)
})

// Owner decision 2026-10-28 ("from when you last did it"): a date the app's
// cadence rule set is shown to the owner before she saves; a past one is the
// honest answer and must survive the night.
test("leaves a never-started past-due date the cadence rule set (dueSource: cadence_rule)", async () => {
  const H = "rf-cadence-rule"
  await tpl(H, "t1", "weekly")
  await inst(H, "i1", "t1", { dueSource: "cadence_rule" })
  const res = await runRollForward(db, TODAY)
  assert.ok(res.skippedCadenceRule >= 1)
  const after = (await db.doc(`homes/${H}/taskInstances/i1`).get()).data()
  assert.equal(after.dueDate, PAST) // untouched
  assert.equal(after.updatedAt.isEqual(NOW), true) // not even re-stamped
})

test("still rolls a never-started past-due date with no marker, or another marker, beside a marked one", async () => {
  const H = "rf-cadence-rule-mixed"
  await tpl(H, "t1", "weekly")
  await tpl(H, "t2", "weekly")
  await tpl(H, "t3", "weekly")
  await inst(H, "marked", "t1", { dueSource: "cadence_rule" })
  await inst(H, "plain", "t2")
  await inst(H, "other", "t3", { dueSource: "something_else" })
  await runRollForward(db, TODAY)
  const due = async (id) => (await db.doc(`homes/${H}/taskInstances/${id}`).get()).get("dueDate")
  assert.equal(await due("marked"), PAST)
  assert.equal(await due("plain"), "2026-06-30") // today + 7
  assert.equal(await due("other"), "2026-06-30")
  // A rolled date is not the rule's: the job says so (writers that move dueDate set dueSource).
  assert.equal((await db.doc(`homes/${H}/taskInstances/other`).get()).get("dueSource"), null)
})
