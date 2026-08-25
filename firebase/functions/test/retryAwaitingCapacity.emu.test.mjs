/**
 * retryAwaitingCapacity (HH-124, server half) — drives runCapacityRetry against
 * the Firestore emulator with the charge/enqueue effects injected, so the whole
 * decision table is exercised without Cloud Tasks or a real quota.
 *
 * The cases that matter are the expensive ones. Restarting is cheap to get
 * right; the ways this job can BURN money or break a promise are what is
 * pinned here: charging the wrong person, charging twice, grinding against an
 * exhausted global budget, and parsing something the user forgot about days ago.
 */
import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runCapacityRetry, MAX_PARKED_MS } from "../lib/firebase/functions/src/schedule/retryAwaitingCapacity.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const NOW = Date.parse("2026-08-25T12:00:00.000Z")

/** Every home this file creates. The reset below is scoped to this prefix. */
const OWNED = "cap-"

/**
 * The sweep is a COLLECTION-GROUP query, so it sees every home in the emulator —
 * including manuals an earlier test in this file parked and left behind. Without
 * a reset the tests pass or fail depending on their order, which is exactly the
 * kind of green that means nothing. (Found the honest way: the stale-expiry test
 * reported 5 restarts it never asked for.)
 *
 * Scoped to this file's own homes, NOT every manual in the emulator. `node
 * --test` runs these files CONCURRENTLY against one shared emulator, so a
 * blanket `collectionGroup("manuals").delete()` would reach into whatever the
 * parse-worker and commitManualDraft suites were doing at that moment and
 * delete it mid-test. The first version of this hook did exactly that.
 */
beforeEach(async () => {
  const parked = await db.collectionGroup("manuals").where("parse.stage", "==", "awaiting_capacity").get()
  await Promise.all(
    parked.docs
      .filter((d) => d.ref.parent.parent?.id.startsWith(OWNED))
      .map((d) => d.ref.delete()),
  )
})

/** The HttpsError shape the retry branches on — details, not the sentence. */
function refusal(scope) {
  return Object.assign(new Error(`refused: ${scope}`), {
    code: "resource-exhausted",
    details: { kind: "quota_exhausted", scope },
  })
}

async function park(home, manualId, { uid = "u1", agoMs = 60_000, mode = "preview" } = {}) {
  await db.doc(`homes/${home}/manuals/${manualId}`).set({
    parse: {
      stage: "awaiting_capacity",
      mode,
      awaiting: { uid, since: Timestamp.fromMillis(NOW - agoMs) },
    },
  })
}

function spy({ refuse = () => null } = {}) {
  const charged = []
  const enqueued = []
  return {
    charged,
    enqueued,
    effects: {
      charge: async (uid) => {
        charged.push(uid)
        const scope = refuse(uid, charged.length)
        if (scope) throw refusal(scope)
      },
      enqueue: async (p) => { enqueued.push(p) },
    },
  }
}

/** Guards the scoping above: a home outside the prefix would not be reset. */
function home(name) {
  assert.ok(name.startsWith(OWNED), `test home ${name} must start with ${OWNED}`)
  return name
}

const stageOf = async (home, id) => (await db.doc(`homes/${home}/manuals/${id}`).get()).get("parse.stage")

test("restarts a parked manual on the parker's quota, oldest first", async () => {
  const H = home("cap-basic")
  await park(H, "newer", { uid: "u1", agoMs: 60_000 })
  await park(H, "older", { uid: "u2", agoMs: 600_000 })

  const s = spy()
  const res = await runCapacityRetry(db, s.effects, NOW)

  assert.equal(res.restarted, 2)
  // Oldest first: the person who waited longest is not overtaken.
  assert.deepEqual(s.charged, ["u2", "u1"])
  assert.deepEqual(s.enqueued.map((e) => e.manualId), ["older", "newer"])
  // And it charges the user who parked it, not the one who happened to be first.
  assert.equal(s.enqueued[0].homeId, H)
  assert.equal(await stageOf(H, "older"), "queued")
})

test("clears `awaiting` so a restarted manual is never picked up twice", async () => {
  const H = home("cap-once")
  await park(H, "m1")
  await runCapacityRetry(db, spy().effects, NOW)

  const second = spy()
  const res = await runCapacityRetry(db, second.effects, NOW)
  assert.equal(res.scanned, 0, "a restarted manual must leave the parked query")
  assert.deepEqual(second.charged, [], "and must not be charged again")
})

test("a daily refusal parks that user only — others still start", async () => {
  const H = home("cap-daily")
  await park(H, "broke-1", { uid: "broke", agoMs: 900_000 })
  await park(H, "broke-2", { uid: "broke", agoMs: 800_000 })
  await park(H, "rich-1", { uid: "rich", agoMs: 700_000 })

  const s = spy({ refuse: (uid) => (uid === "broke" ? "daily" : null) })
  const res = await runCapacityRetry(db, s.effects, NOW)

  assert.equal(res.restarted, 1)
  assert.equal(res.stillRefused, 2)
  assert.equal(res.stoppedOnGlobalCeiling, false)
  // The second manual of a user already refused is NOT charged again: their cap
  // is daily, so a retry moments later cannot succeed and only costs a write.
  assert.deepEqual(s.charged, ["broke", "rich"])
  assert.equal(await stageOf(H, "broke-1"), "awaiting_capacity", "stays parked for the next sweep")
  assert.equal(await stageOf(H, "rich-1"), "queued")
})

test("a global refusal ends the run instead of grinding", async () => {
  const H = home("cap-global")
  await park(H, "a", { uid: "u1", agoMs: 900_000 })
  await park(H, "b", { uid: "u2", agoMs: 800_000 })
  await park(H, "c", { uid: "u3", agoMs: 700_000 })

  const s = spy({ refuse: () => "global" })
  const res = await runCapacityRetry(db, s.effects, NOW)

  assert.equal(res.stoppedOnGlobalCeiling, true)
  assert.equal(res.restarted, 0)
  assert.equal(s.charged.length, 1, "stops after the first refusal — nothing else can succeed")
  assert.equal(await stageOf(H, "a"), "awaiting_capacity", "everything stays parked")
})

test("work parked too long becomes a visible error, not a surprise parse", async () => {
  const H = home("cap-stale")
  await park(H, "ancient", { agoMs: MAX_PARKED_MS + 60_000 })

  const s = spy()
  const res = await runCapacityRetry(db, s.effects, NOW)

  assert.equal(res.expired, 1)
  assert.equal(res.restarted, 0)
  assert.deepEqual(s.charged, [], "never charge for work nobody is expecting any more")
  assert.equal(await stageOf(H, "ancient"), "error")
  const msg = (await db.doc(`homes/${H}/manuals/ancient`).get()).get("parse.error.message")
  assert.match(msg, /scan it now/i, "leaves the user an action, not a dead end")
})

test("a parked doc with no owner expires instead of being scanned forever", async () => {
  const H = home("cap-noowner")
  await db.doc(`homes/${H}/manuals/orphan`).set({
    parse: { stage: "awaiting_capacity", mode: "preview", awaiting: { since: Timestamp.fromMillis(NOW - 1000) } },
  })

  const s = spy()
  const res = await runCapacityRetry(db, s.effects, NOW)

  assert.equal(res.expired, 1)
  assert.deepEqual(s.charged, [], "there is no one to charge")
  assert.equal(await stageOf(H, "orphan"), "error")
})

test("one sweep cannot drain the budget — the batch is bounded", async () => {
  const H = home("cap-bound")
  for (let i = 0; i < 6; i++) await park(H, `m${i}`, { uid: `u${i}`, agoMs: 10_000 + i })

  const s = spy()
  const res = await runCapacityRetry(db, s.effects, NOW, 3)

  assert.equal(res.scanned, 3)
  assert.equal(res.restarted, 3)
  assert.equal(s.enqueued.length, 3)
})

test("preserves the parse mode it was parked with", async () => {
  const H = home("cap-mode")
  await park(H, "m1", { mode: "fill_gaps" })
  const s = spy()
  await runCapacityRetry(db, s.effects, NOW)
  assert.equal(s.enqueued[0].mode, "fill_gaps")
  assert.equal((await db.doc(`homes/${H}/manuals/m1`).get()).get("parse.mode"), "fill_gaps")
})
