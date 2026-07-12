/**
 * completeTask integration test — drives runCompleteTask against the emulator.
 * Verifies v1 complete_task_instance semantics: mark done + generate the next
 * occurrence (with denorm carried over); dup-suppress when an open instance
 * already exists; no next for non-recurring types.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runCompleteTask } from "../lib/firebase/functions/src/tasks/completeTask.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()
const NOW = Timestamp.fromDate(new Date("2026-06-23T00:00:00Z"))

async function tpl(H, id, scheduleType, { intervalDays = null, defaultAssignee = null, isActive = true } = {}) {
  await db.doc(`homes/${H}/taskTemplates/${id}`).set({
    schedule: { scheduleType, intervalDays, windowDaysBefore: 7, windowDaysAfter: 14 },
    isActive, deletedAt: null, defaultAssignee,
  })
}
async function inst(H, id, templateId, { status = "scheduled", dueDate = "2026-06-18", tier = "recommended", assignedTo = null } = {}) {
  await db.doc(`homes/${H}/taskInstances/${id}`).set({
    taskTemplateId: templateId, itemUnitId: "item1", status, dueDate, deletedAt: null,
    priorityTier: tier, careType: "maintenance", scopeType: "item_unit", estimatedMinutes: 15,
    scheduleType: "monthly", title: "Flush the water heater", itemName: "Rheem", roomName: "Garage",
    assignedTo, createdAt: NOW, updatedAt: NOW,
  })
}
const openCount = async (H, templateId) =>
  (await db.collection(`homes/${H}/taskInstances`).where("taskTemplateId", "==", templateId).where("status", "in", ["scheduled", "snoozed"]).get()).size

test("marks done and generates the next occurrence with denorm carried over", async () => {
  const H = "ct-basic"
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1", { dueDate: "2026-06-18" })
  const res = await runCompleteTask(db, { homeId: H, taskInstanceId: "i1", completedOn: "2026-06-23" })

  assert.equal(res.completedInstanceId, "i1")
  assert.ok(res.nextInstanceId)
  const done = await db.doc(`homes/${H}/taskInstances/i1`).get()
  assert.equal(done.get("status"), "done")
  assert.ok(done.get("completedAt"))
  const next = await db.doc(`homes/${H}/taskInstances/${res.nextInstanceId}`).get()
  assert.equal(next.get("status"), "scheduled")
  assert.equal(next.get("dueDate"), "2026-07-23") // completedOn + 1 month
  assert.equal(next.get("title"), "Flush the water heater") // denorm carried
  assert.equal(next.get("itemName"), "Rheem")
})

test("suppresses the next occurrence when another open instance already exists", async () => {
  const H = "ct-dup"
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1")
  await inst(H, "i2", "t1", { dueDate: "2026-07-01" }) // another open one
  const res = await runCompleteTask(db, { homeId: H, taskInstanceId: "i1", completedOn: "2026-06-23" })
  assert.equal(res.nextInstanceId, null)
  // i1 done, i2 still open → exactly 1 open remains (no new insert).
  assert.equal(await openCount(H, "t1"), 1)
})

test("no next occurrence for non-recurring schedule types", async () => {
  const H = "ct-nonrec"
  await tpl(H, "t1", "as_needed")
  await inst(H, "i1", "t1")
  const res = await runCompleteTask(db, { homeId: H, taskInstanceId: "i1", completedOn: "2026-06-23" })
  assert.equal(res.nextInstanceId, null)
  assert.equal((await db.doc(`homes/${H}/taskInstances/i1`).get()).get("status"), "done")
})

test("inherits a still-member assignee onto the next occurrence", async () => {
  const H = "ct-assignee"
  await db.doc(`homes/${H}/members/userA`).set({ uid: "userA", role: "owner" })
  await tpl(H, "t1", "monthly", { defaultAssignee: "userA" })
  await inst(H, "i1", "t1")
  const res = await runCompleteTask(db, { homeId: H, taskInstanceId: "i1", completedOn: "2026-06-23" })
  const next = await db.doc(`homes/${H}/taskInstances/${res.nextInstanceId}`).get()
  assert.equal(next.get("assignedTo"), "userA")
})
