/**
 * The whole push sweep against the Firestore emulator, with a fake sender.
 *
 * FCM has no emulator, so the SEND is faked; everything else is real — the
 * collection-group query, the template join, the shopping-list coverage, the
 * per-user prefs read, the dedupe state written back. What this proves that
 * lanes.test cannot: the data plumbing between them.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { runPushSweep } from "../lib/firebase/functions/src/push/sweep.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

let n = 0
const fresh = () => `sweep-${Date.now()}-${n++}`

/** A home with one member, one curated task due in 3 days with a buy-ahead part,
 *  one null-flag Recommended task due today, and one deadline due today. */
async function seedHome({ homeId, uid, prefs }) {
  const home = `homes/${homeId}`
  await db.doc(home).set({ name: "Sweep home" })
  await db.doc(`${home}/members/${uid}`).set({ role: "owner" })
  if (prefs) await db.doc(`users/${uid}/private/preferences`).set({ notifications: prefs })

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date("2026-09-07T16:00:00Z")) // Mon Sep 7, 9am PDT
  const plus = (d) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }

  await db.doc(`${home}/taskTemplates/tpl-filter`).set({
    title: "Replace the furnace filter", priorityTier: "recommended", remindEnabled: true, isActive: true, deletedAt: null,
    supplies: [{ name: "Furnace filter", category: "filter", partNumber: "FPR10", url: "https://filterbuy.com/x", size: "16x25x1", buyAhead: true }],
  })
  await db.doc(`${home}/taskTemplates/tpl-flush`).set({ title: "Flush the water heater", priorityTier: "recommended", remindEnabled: null, isActive: true, deletedAt: null })
  await db.doc(`${home}/taskTemplates/tpl-warranty`).set({ title: "Warranty claim closes", priorityTier: "essential", remindEnabled: null, isActive: true, deletedAt: null })

  const inst = (id, tpl, title, dueDate, extra = {}) =>
    db.doc(`${home}/taskInstances/${id}`).set({
      taskTemplateId: tpl, title, dueDate, status: "scheduled", deletedAt: null, careType: "maintenance", scopeType: "item_unit",
      itemUnitId: "furnace", itemName: "Furnace", priorityTier: "recommended", scheduleType: "monthly", isSafetyCritical: false, ...extra,
    })
  await inst("inst-filter", "tpl-filter", "Replace the furnace filter", plus(3))
  await inst("inst-flush", "tpl-flush", "Flush the water heater", today)
  await inst("inst-warranty", "tpl-warranty", "Warranty claim closes", today, { scheduleType: "as_needed", priorityTier: "essential" })
  return { home, today }
}

function fakeSender() {
  const sent = []
  const send = async (_db, uid, notification, data) => { sent.push({ uid, ...notification, url: data?.url }); return { sent: 1, failed: 0 } }
  return { sent, send }
}

test("Monday 9am, curated mode: the deadline pushes, the null-flag task does not, buy-ahead names the part", async () => {
  const homeId = fresh(), uid = fresh()
  await seedHome({ homeId, uid, prefs: { push_mode: "curated" } })
  const { sent, send } = fakeSender()

  const report = await runPushSweep(db, new Date("2026-09-07T16:00:00Z"), send) // 09:00 PDT Monday
  const mine = sent.filter((s) => s.uid === uid)

  const morning = mine.find((s) => s.title === "Deadline today")
  assert.ok(morning, `expected the deadline push, got ${JSON.stringify(mine)}`)
  assert.equal(morning.body, "Warranty claim closes") // "Flush" is null-flag Recommended → not in curated mode
  assert.equal(morning.url, `/tasks/inst-warranty?home=${homeId}`)

  const buy = mine.find((s) => /order this week/.test(s.title))
  assert.ok(buy, "expected a buy-ahead push")
  assert.equal(buy.title, "Furnace filter · 16x25x1 — order this week")
  assert.equal(buy.url, `/items/furnace?task=tpl-filter&home=${homeId}`)

  assert.equal(mine.some((s) => s.title === "Your week at home"), false, "Monday 9am is not the digest hour")
  assert.ok(report.pushesSent >= 2)

  // dedupe state was written, so the next tick is silent
  const again = fakeSender()
  await runPushSweep(db, new Date("2026-09-07T17:00:00Z"), again.send)
  assert.equal(again.sent.filter((s) => s.uid === uid).length, 0, "second tick must not repeat the morning or buy-ahead pushes")
})

test("Sunday 5pm: the digest fires for the user's chosen hour and lands on /week", async () => {
  const homeId = fresh(), uid = fresh()
  await seedHome({ homeId, uid, prefs: { push_mode: "curated", weekly_digest: { enabled: true, day: 0, hour: 17 } } })
  const { sent, send } = fakeSender()
  await runPushSweep(db, new Date("2026-09-07T00:00:00Z"), send) // Sunday Sep 6, 17:00 PDT
  const digest = sent.find((s) => s.uid === uid && s.title === "Your week at home")
  assert.ok(digest, `expected the digest, got ${JSON.stringify(sent.filter((s) => s.uid === uid))}`)
  assert.match(digest.body, /Replace the furnace filter/)
  assert.match(digest.body, /One thing to buy first/)
  assert.equal(digest.url, `/week?home=${homeId}`)
})

test("'I have one' on the shopping list removes the part from both the digest and buy-ahead", async () => {
  const homeId = fresh(), uid = fresh()
  const { home } = await seedHome({ homeId, uid, prefs: { push_mode: "curated" } })
  await db.collection(`${home}/shoppingList`).add({ name: "Furnace filter", status: "have", sourceTaskInstanceId: "inst-filter", deletedAt: null })
  const { sent, send } = fakeSender()
  await runPushSweep(db, new Date("2026-09-07T16:00:00Z"), send)
  assert.equal(sent.some((s) => s.uid === uid && /order this week/.test(s.title)), false, "covered part must not push")
  // The digest side, through the sweep itself at the user's digest hour. (This
  // used to go through composeDigestForUser, which existed only for the
  // deleted previewDigest callable.)
  const sunday = fakeSender()
  await runPushSweep(db, new Date("2026-09-07T00:00:00Z"), sunday.send) // Sunday Sep 6, 17:00 PDT
  const digest = sunday.sent.find((s) => s.uid === uid && s.title === "Your week at home")
  assert.ok(digest, "the digest still goes — the part is covered, the reminder is not")
  assert.doesNotMatch(digest.body, /to buy first/, "a covered part is not counted as something to buy")
})

test("a user with the task-reminders switch OFF gets no morning push, but their digest still arrives", async () => {
  const homeId = fresh(), uid = fresh()
  await seedHome({ homeId, uid, prefs: { push_mode: "curated", events: { task_reminders: { push: false } }, weekly_digest: { enabled: true, day: 0, hour: 17 } } })
  const a = fakeSender()
  await runPushSweep(db, new Date("2026-09-07T16:00:00Z"), a.send)
  assert.equal(a.sent.some((s) => s.uid === uid && s.title === "Deadline today"), false)
  const b = fakeSender()
  await runPushSweep(db, new Date("2026-09-07T00:00:00Z"), b.send)
  assert.ok(b.sent.some((s) => s.uid === uid && s.title === "Your week at home"))
})

test("a user with NO prefs doc gets today's defaults: Essentials remind, the digest is Sunday 5 PM", async () => {
  const homeId = fresh(), uid = fresh()
  await seedHome({ homeId, uid, prefs: null })
  const { sent, send } = fakeSender()
  await runPushSweep(db, new Date("2026-09-07T16:00:00Z"), send)
  const morning = sent.find((s) => s.uid === uid && s.title === "Deadline today")
  assert.ok(morning, "defaults must still deliver a deadline")
})

// ─── C8: decide who is due first; read candidates only for their homes ──────

const MONDAY_9AM = new Date("2026-09-07T16:00:00Z") // Mon Sep 7, 09:00 PDT → local date 2026-09-07
const daysBefore = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
const deadline = (home, id, title, dueDate) =>
  db.doc(`${home}/taskInstances/${id}`).set({
    taskTemplateId: null, title, dueDate, status: "scheduled", deletedAt: null, careType: "maintenance", scopeType: "item_unit",
    itemUnitId: "furnace", itemName: "Furnace", priorityTier: "essential", scheduleType: "as_needed", isSafetyCritical: false,
  })

test("the lower bound: a deadline overdue by more than 60 days no longer rides the morning push", async () => {
  const homeId = fresh(), uid = fresh()
  const home = `homes/${homeId}`
  await db.doc(home).set({ name: "Old deadlines" })
  await db.doc(`${home}/members/${uid}`).set({ role: "owner", uid })
  await deadline(home, "d61", "Register the warranty (61 days ago)", daysBefore("2026-09-07", 61))
  await deadline(home, "d60", "Renew the permit (60 days ago)", daysBefore("2026-09-07", 60))
  await deadline(home, "d59", "Warranty claim closes (59 days ago)", daysBefore("2026-09-07", 59))

  const { sent, send } = fakeSender()
  await runPushSweep(db, MONDAY_9AM, send)
  const morning = sent.find((s) => s.uid === uid && /deadline/i.test(s.title))
  assert.ok(morning, `expected a deadline push, got ${JSON.stringify(sent.filter((s) => s.uid === uid))}`)
  assert.equal(morning.title, "2 deadlines today", "exactly the two inside the 60-day window")
  assert.doesNotMatch(morning.body, /61 days ago/, "past the lower bound")
  assert.match(morning.body, /60 days ago/, "the bound itself is inclusive")
  assert.match(morning.body, /59 days ago/)
})

test("a tick where nobody is due reads memberships and user docs — and not one task, template or shopping row", async () => {
  // 03:00 PDT on a Monday: before every morning lane, and nobody's digest hour.
  const homeId = fresh(), uid = fresh()
  await seedHome({ homeId, uid, prefs: { push_mode: "curated" } })
  const { sent, send } = fakeSender()
  const report = await runPushSweep(db, new Date("2026-09-07T10:00:00Z"), send)
  assert.equal(report.homesDue, 0)
  assert.equal(report.reads.instances, 0)
  assert.equal(report.reads.templates, 0)
  assert.equal(report.reads.shopping, 0)
  assert.equal(report.reads.userDocs, 2 * report.usersChecked, "prefs + push state, per user")
  assert.equal(report.docsRead, report.reads.members + report.reads.userDocs, "docsRead is the logged total")
  assert.equal(sent.filter((s) => s.uid === uid).length, 0)
})

test("only the homes of due members are read — a home whose members are not due is skipped", async () => {
  // Wednesday 04:00 PDT: before the morning lane for everyone, and the digest
  // hour of exactly one seeded user.
  const WED_4AM = new Date("2026-09-09T11:00:00Z")
  const dueHome = fresh(), dueUid = fresh()
  const idleHome = fresh(), idleUid = fresh()
  await seedHome({ homeId: dueHome, uid: dueUid, prefs: { push_mode: "curated", weekly_digest: { enabled: true, day: 3, hour: 4 } } })
  await seedHome({ homeId: idleHome, uid: idleUid, prefs: { push_mode: "curated" } })

  const { sent, send } = fakeSender()
  const report = await runPushSweep(db, WED_4AM, send)
  assert.equal(report.usersDue, 1, "only the user whose digest hour this is")
  assert.equal(report.homesDue, 1, "so only their home's tasks are read")
  assert.equal(report.digest, 1)
  assert.ok(sent.some((s) => s.uid === dueUid && s.title === "Your week at home"))
  assert.equal(sent.some((s) => s.uid === idleUid), false)
})

test("a user in two homes still gets ONE morning push, for the home the old query reached first", async () => {
  // The old sweep visited homes in the order of their earliest eligible
  // instance (dueDate, then path) and re-read push state between them, so the
  // morning lane fired for the first home only. Candidates are now read per
  // home; the order and the single push must survive that.
  const uid = fresh()
  const first = fresh(), second = fresh()
  for (const h of [first, second]) {
    await db.doc(`homes/${h}`).set({ name: h })
    await db.doc(`homes/${h}/members/${uid}`).set({ role: "owner", uid })
  }
  await deadline(`homes/${second}`, "later", "Warranty registration due", "2026-09-07")
  await deadline(`homes/${first}`, "earlier", "Warranty claim closes", "2026-09-06")

  const { sent, send } = fakeSender()
  await runPushSweep(db, MONDAY_9AM, send)
  const mornings = sent.filter((s) => s.uid === uid && /deadline/i.test(s.title))
  assert.equal(mornings.length, 1, `one morning push, got ${JSON.stringify(mornings)}`)
  assert.match(mornings[0].url, new RegExp(`home=${first}`), "the home with the earliest eligible instance")
})
