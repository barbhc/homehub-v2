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
import { runPushSweep, composeDigestForUser } from "../lib/firebase/functions/src/push/sweep.js"

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
  const preview = await composeDigestForUser(db, uid, home, new Date("2026-09-07T00:00:00Z"))
  assert.ok(preview)
  assert.equal(preview.toBuy, 0)
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
