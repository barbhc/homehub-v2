/**
 * completeTask integration test — drives runCompleteTask against the emulator.
 * Verifies v1 complete_task_instance semantics: mark done + generate the next
 * occurrence (with denorm carried over); dup-suppress when an open instance
 * already exists; no next for non-recurring types. The second half drives the
 * callable's body (handleCompleteTask) and the real export for the completion
 * date: the home's calendar, ±1 day, invalid-argument — never internal.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runCompleteTask, handleCompleteTask, completeTask } from "../lib/firebase/functions/src/tasks/completeTask.js"

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

/**
 * Start each test from an empty home. A completion MINTS a next instance, and
 * on a long-lived emulator the one from the previous run is still open — so
 * the rerun's completion is dup-suppressed and every "next occurrence"
 * assertion fails for a reason that has nothing to do with the code. Scoped to
 * the test's own home: node --test runs files concurrently on one emulator.
 */
async function fresh(H) {
  await db.recursiveDelete(db.doc(`homes/${H}`))
}

test("marks done and generates the next occurrence with denorm carried over", async () => {
  const H = "ct-basic"
  await fresh(H)
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
  await fresh(H)
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
  await fresh(H)
  await tpl(H, "t1", "as_needed")
  await inst(H, "i1", "t1")
  const res = await runCompleteTask(db, { homeId: H, taskInstanceId: "i1", completedOn: "2026-06-23" })
  assert.equal(res.nextInstanceId, null)
  assert.equal((await db.doc(`homes/${H}/taskInstances/i1`).get()).get("status"), "done")
})

test("inherits a still-member assignee onto the next occurrence", async () => {
  const H = "ct-assignee"
  await fresh(H)
  await db.doc(`homes/${H}/members/userA`).set({ uid: "userA", role: "owner" })
  await tpl(H, "t1", "monthly", { defaultAssignee: "userA" })
  await inst(H, "i1", "t1")
  const res = await runCompleteTask(db, { homeId: H, taskInstanceId: "i1", completedOn: "2026-06-23" })
  const next = await db.doc(`homes/${H}/taskInstances/${res.nextInstanceId}`).get()
  assert.equal(next.get("assignedTo"), "userA")
})

// ── The completion date (handleCompleteTask + the real callable) ─────────────
//
// completedOn used to be a UTC date on both ends, so a check-off after ~5 pm
// Pacific was recorded as TOMORROW and the next due date slid a day. The
// server now reads it against the HOME's calendar, defaults to the home's
// today, and refuses anything more than a day off it — as invalid-argument,
// never as "internal". The handler takes the clock as an argument so the day
// boundary is pinned, not left to whenever the suite happens to run.

/** Sep 29, 7:30 pm PDT — UTC already says Sep 30. */
const EVENING_PT = new Date("2026-09-30T02:30:00Z")

async function homeDoc(H, timezone) {
  await db.doc(`homes/${H}`).set(timezone === undefined ? { name: "Date Home" } : { name: "Date Home", timezone })
}
async function member(H, uid) {
  await db.doc(`homes/${H}/members/${uid}`).set({ uid, role: "owner" })
}
const completedAtIso = async (H, id) =>
  (await db.doc(`homes/${H}/taskInstances/${id}`).get()).get("completedAt").toDate().toISOString()
const statusOf = async (H, id) => (await db.doc(`homes/${H}/taskInstances/${id}`).get()).get("status")

/** Assert the promise rejects with exactly this HttpsError code. */
async function rejectsWith(promise, code) {
  await assert.rejects(promise, (e) => {
    assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`)
    return true
  })
}

test("date: no completedOn → the HOME's today, not UTC's (7:30 pm Pacific is still the 29th)", async () => {
  for (const [H, tz] of [["ct-date-default", "America/Los_Angeles"], ["ct-date-notz", undefined]]) {
    await fresh(H)
    await homeDoc(H, tz)
    await member(H, "u1")
    await tpl(H, "t1", "monthly")
    await inst(H, "i1", "t1")
    const res = await handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: "i1" }, EVENING_PT)
    assert.equal(await completedAtIso(H, "i1"), "2026-09-29T12:00:00.000Z", H)
    const next = await db.doc(`homes/${H}/taskInstances/${res.nextInstanceId}`).get()
    assert.equal(next.get("dueDate"), "2026-10-29", H) // a month from the 29th, not the 30th
  }
})

test("date: today and ±1 day are recorded as sent", async () => {
  const H = "ct-date-window"
  await fresh(H)
  await homeDoc(H, "America/Los_Angeles")
  await member(H, "u1")
  await tpl(H, "t1", "as_needed") // no next instance, so each check-off stands alone
  for (const [i, on] of ["2026-09-28", "2026-09-29", "2026-09-30"].entries()) {
    await inst(H, `ok${i}`, "t1")
    await handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: `ok${i}`, completedOn: on }, EVENING_PT)
    assert.equal(await completedAtIso(H, `ok${i}`), `${on}T12:00:00.000Z`)
  }
})

test("date: ±2 days is invalid-argument and the task is left untouched", async () => {
  const H = "ct-date-reject"
  await fresh(H)
  await homeDoc(H, "America/Los_Angeles")
  await member(H, "u1")
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1")
  for (const on of ["2026-09-27", "2026-10-01"]) {
    await rejectsWith(handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: "i1", completedOn: on }, EVENING_PT), "invalid-argument")
  }
  assert.equal(await statusOf(H, "i1"), "scheduled")
  assert.equal(await openCount(H, "t1"), 1) // and no next instance was minted
})

test("date: the window follows the HOME's timezone, not a hardcoded Pacific one", async () => {
  // Kiritimati is UTC+14: at EVENING_PT it is already Sep 30 there, while LA
  // says Sep 29. So Sep 28 is two days off at this home (refused) though only
  // one in LA, and Oct 1 is one day off here (accepted) though two in LA.
  const H = "ct-date-home-tz"
  await fresh(H)
  await homeDoc(H, "Pacific/Kiritimati")
  await member(H, "u1")
  await tpl(H, "t1", "as_needed")
  await inst(H, "i1", "t1")
  await inst(H, "i2", "t1")
  await rejectsWith(handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: "i1", completedOn: "2026-09-28" }, EVENING_PT), "invalid-argument")
  await handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: "i2", completedOn: "2026-10-01" }, EVENING_PT)
  assert.equal(await completedAtIso(H, "i2"), "2026-10-01T12:00:00.000Z")
  // …and with no date at all, "today" is the home's Sep 30.
  await handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: "i1" }, EVENING_PT)
  assert.equal(await completedAtIso(H, "i1"), "2026-09-30T12:00:00.000Z")
})

test("date: 'A few days ago' (five days back) needs backdated: true", async () => {
  const H = "ct-date-backdated"
  await fresh(H)
  await homeDoc(H, "America/Los_Angeles")
  await member(H, "u1")
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1")
  await rejectsWith(handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: "i1", completedOn: "2026-09-24" }, EVENING_PT), "invalid-argument")
  const res = await handleCompleteTask(db, "u1", { homeId: H, taskInstanceId: "i1", completedOn: "2026-09-24", backdated: true }, EVENING_PT)
  assert.equal(await completedAtIso(H, "i1"), "2026-09-24T12:00:00.000Z")
  const next = await db.doc(`homes/${H}/taskInstances/${res.nextInstanceId}`).get()
  assert.equal(next.get("dueDate"), "2026-10-24")
})

test("callable: a bad date is invalid-argument end to end — never internal", async () => {
  // Through the real onCall export, not the helper: the wrapper's catch-all
  // turns what it catches into "internal", so the check must run before it.
  const H = "ct-date-callable"
  await fresh(H)
  await homeDoc(H, "America/Los_Angeles")
  await member(H, "u1")
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1")
  for (const completedOn of ["banana", "2026-02-30", "2000-01-01", 20260929]) {
    await rejectsWith(completeTask.run({ data: { homeId: H, taskInstanceId: "i1", completedOn }, auth: { uid: "u1" } }), "invalid-argument")
  }
  await rejectsWith(
    completeTask.run({ data: { homeId: H, taskInstanceId: "i1", completedOn: "2026-09-29", backdated: "yes" }, auth: { uid: "u1" } }),
    "invalid-argument",
  )
  await rejectsWith(completeTask.run({ data: { homeId: H, taskInstanceId: "i1" } }), "unauthenticated")
  await rejectsWith(completeTask.run({ data: { homeId: H, taskInstanceId: "i1" }, auth: { uid: "stranger" } }), "permission-denied")
  assert.equal(await statusOf(H, "i1"), "scheduled")
})

test("callable: the home's today on the real clock goes through", async () => {
  const H = "ct-date-callable-ok"
  await fresh(H)
  await homeDoc(H, "America/Los_Angeles")
  await member(H, "u1")
  await tpl(H, "t1", "monthly")
  await inst(H, "i1", "t1")
  // Computed here, independently of completedOn.ts. A run that straddles
  // midnight still passes: yesterday is inside the tolerance.
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  )
  const today = `${p.year}-${p.month}-${p.day}`
  const res = await completeTask.run({ data: { homeId: H, taskInstanceId: "i1", completedOn: today }, auth: { uid: "u1" } })
  assert.ok(res.nextInstanceId)
  assert.equal(await completedAtIso(H, "i1"), `${today}T12:00:00.000Z`)
})
