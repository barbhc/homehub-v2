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
async function inst(H, id, templateId, { status = "scheduled", dueDate = PAST } = {}) {
  await db.doc(`homes/${H}/taskInstances/${id}`).set({ taskTemplateId: templateId, status, dueDate, deletedAt: null, updatedAt: NOW })
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
