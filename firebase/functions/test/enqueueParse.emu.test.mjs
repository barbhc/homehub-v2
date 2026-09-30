/**
 * Check before charging (C1) — enqueueParse's core against the Firestore
 * emulator, with the real quota transaction and a fake task queue.
 *
 * The expensive failure this pins: the item page asking again for the manual
 * the add wizard had just started. enqueueParse used to charge 10 units first,
 * check only the home-wide count, overwrite the requestId and enqueue with no
 * task id — a second charge and a second Claude call for one manual.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runEnqueueParse, MAX_IN_FLIGHT } from "../lib/firebase/functions/src/parse/enqueueParse.js"
import { chargeAiQuota } from "../lib/firebase/functions/src/lib/quota.js"
import { isParseInFlightMessage, PARSE_ERR } from "../lib/shared/parse/parseErrors.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

let n = 0
const fresh = (label) => `enq-${label}-${Date.now()}-${n++}`
const MIN = 60_000
// This suite's own clock for charges (aiSpendGlobal/2031-02): the other
// suites charge in parallel, and the emulator aborts transactions that queue
// on one hot document.
const AT = new Date("2031-02-15T12:00:00Z")
const DAY = "2031-02-15"
const MONTH = "2031-02"

/** A home with a member and one manual, whose `parse` is whatever the test says. */
async function seedHome({ parse = null, uid = fresh("uid"), extraManuals = [] } = {}) {
  const homeId = fresh("home")
  await db.doc(`homes/${homeId}`).set({ name: "Enqueue home" })
  await db.doc(`homes/${homeId}/members/${uid}`).set({ uid, role: "owner" })
  await db.doc(`homes/${homeId}/manuals/m1`).set({ itemUnitId: "i1", sourceType: "upload", sourceRef: "manuals/x.pdf", ...(parse ? { parse } : {}) })
  for (const [id, p] of extraManuals) {
    await db.doc(`homes/${homeId}/manuals/${id}`).set({ itemUnitId: "i1", sourceType: "upload", sourceRef: `manuals/${id}.pdf`, parse: p })
  }
  return { homeId, uid, manual: db.doc(`homes/${homeId}/manuals/m1`) }
}

const agoTs = (ms) => Timestamp.fromMillis(Date.now() - ms)

/** Deps with the REAL charge (own caps doc, so parallel suites cannot move
 *  the numbers) and a recording task queue. */
function deps({ enqueueFails = null, configDoc = `config/spend-enq-${Date.now()}-${n++}` } = {}) {
  const enqueued = []
  return {
    enqueued,
    deps: {
      charge: (uid) => chargeAiQuota(db, uid, "enqueueParse", { configDoc, at: AT }),
      enqueue: async (payload, taskId) => {
        if (enqueueFails) throw enqueueFails
        enqueued.push({ payload, taskId })
      },
    },
  }
}
const units = async (uid) => (await db.doc(`usage/${uid}/daily/${DAY}`).get()).get("units") ?? 0

test("a manual being read RIGHT NOW is refused before any charge — naming the scan to follow", async () => {
  const { homeId, uid } = await seedHome({ parse: { stage: "claude_call", stageAt: agoTs(2 * MIN), requestId: "running-run", mode: "preview" } })
  const { deps: d, enqueued } = deps()
  await assert.rejects(
    () => runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" }),
    (err) => {
      assert.equal(err.code, "failed-precondition")
      assert.equal(err.message, PARSE_ERR.alreadyReading)
      assert.ok(isParseInFlightMessage(err.message), "the client recognises the sentence even without details")
      assert.deepEqual(err.details, { kind: "parse_in_flight", requestId: "running-run", mode: "preview", stage: "claude_call" })
      return true
    },
  )
  assert.equal(await units(uid), 0, "refused before the charge")
  assert.equal(enqueued.length, 0)
})

test("a start queues the run, records its charge in the ledger, and uses the requestId as the task id", async () => {
  const { homeId, uid, manual } = await seedHome()
  const { deps: d, enqueued } = deps()
  const res = await runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" })
  assert.equal(await units(uid), 10)
  const parse = (await manual.get()).get("parse")
  assert.equal(parse.stage, "queued")
  assert.equal(parse.requestId, res.requestId)
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0].taskId, res.requestId, "one run can never be queued twice")
  assert.deepEqual(enqueued[0].payload, { homeId, manualId: "m1", requestId: res.requestId, mode: "preview" })
  const ledger = (await db.doc(`parseCharges/${res.requestId}`).get()).data()
  assert.equal(ledger.state, "held")
  assert.equal(ledger.uid, uid)
  assert.equal(ledger.units, 10)
  assert.equal(ledger.day, DAY)
  assert.equal(ledger.month, MONTH)
})

test("a STALLED scan (no stage write for 35+ min) does not lock the manual — it is replaced, and refunded if it never reached Claude", async () => {
  const stale = fresh("stale-run")
  const payer = fresh("payer")
  const { homeId, uid, manual } = await seedHome({ parse: { stage: "pdf_fetched", stageAt: agoTs(40 * MIN), requestId: stale, mode: "preview" } })
  await db.doc(`usage/${payer}/daily/2029-03-01`).set({ units: 10, count: 1 })
  await db.doc(`parseCharges/${stale}`).set({ uid: payer, fn: "enqueueParse", units: 10, day: "2029-03-01", month: "2029-03", state: "held" })
  const { deps: d } = deps()
  const res = await runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" })
  assert.notEqual(res.requestId, stale)
  assert.equal((await manual.get()).get("parse.requestId"), res.requestId)
  assert.equal((await db.doc(`parseCharges/${stale}`).get()).get("state"), "refunded")
  assert.equal((await db.doc(`usage/${payer}/daily/2029-03-01`).get()).get("units"), 0)
})

test("…but a stalled scan whose Claude call had started is replaced WITHOUT a refund", async () => {
  const stale = fresh("vendor-run")
  const { homeId, uid } = await seedHome({ parse: { stage: "claude_call", stageAt: agoTs(40 * MIN), requestId: stale, mode: "preview" } })
  await db.doc(`parseCharges/${stale}`).set({ uid: "someone", fn: "enqueueParse", units: 10, day: "2029-03-01", month: "2029-03", state: "vendor" })
  const { deps: d } = deps()
  await runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" })
  assert.equal((await db.doc(`parseCharges/${stale}`).get()).get("state"), "vendor")
})

test("the home cap counts LIVE scans only — refused without a charge when full, open again once they stall", async () => {
  const live = Array.from({ length: MAX_IN_FLIGHT }, (_, i) => [`live${i}`, { stage: "started", stageAt: agoTs(MIN), requestId: `r${i}`, mode: "preview" }])
  const { homeId, uid } = await seedHome({ extraManuals: live })
  const { deps: d } = deps()
  await assert.rejects(
    () => runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" }),
    (err) => err.code === "resource-exhausted",
  )
  assert.equal(await units(uid), 0)

  const stalled = Array.from({ length: MAX_IN_FLIGHT }, (_, i) => [`dead${i}`, { stage: "claude_call", stageAt: agoTs(3 * 60 * MIN), requestId: `d${i}`, mode: "preview" }])
  const other = await seedHome({ extraManuals: stalled })
  await runEnqueueParse(db, deps().deps, { uid: other.uid, homeId: other.homeId, manualId: "m1", mode: "preview" }) // must not throw
})

test("two starts racing for one manual: one wins; the other is refunded and told to follow the winner", async () => {
  const { homeId, uid } = await seedHome()
  const partner = fresh("partner")
  await db.doc(`homes/${homeId}/members/${partner}`).set({ uid: partner, role: "member" })
  const { deps: d, enqueued } = deps()
  const results = await Promise.allSettled([
    runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" }),
    runEnqueueParse(db, d, { uid: partner, homeId, manualId: "m1", mode: "preview" }),
  ])
  const won = results.filter((r) => r.status === "fulfilled")
  const lost = results.filter((r) => r.status === "rejected")
  assert.equal(won.length, 1, JSON.stringify(results.map((r) => r.status)))
  assert.equal(lost.length, 1)
  assert.equal(lost[0].reason.code, "failed-precondition")
  assert.equal(lost[0].reason.details.requestId, won[0].value.requestId, "the loser follows the winner")
  assert.equal(enqueued.length, 1, "one task, one Claude call")
  assert.equal((await units(uid)) + (await units(partner)), 10, "one charge between them")
})

// The HH-124 parking case ("a quota refusal still parks the manual") lives in
// retryAwaitingCapacity.emu.test.mjs, not here: a parked manual is visible to
// that suite's app-wide collection-group sweep, and node --test runs the two
// files concurrently — CI caught the race (the sweep restarted this file's
// parked manual). In that file it runs in sequence with the sweep's tests and
// under its home-prefix cleanup.

test("if the task cannot be queued: the charge goes back and the manual says so, instead of sitting 'queued'", async () => {
  const { homeId, uid, manual } = await seedHome()
  const { deps: d } = deps({ enqueueFails: new Error("Cloud Tasks unavailable") })
  await assert.rejects(
    () => runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" }),
    (err) => err.code === "unavailable" && err.message === PARSE_ERR.notStarted,
  )
  assert.equal(await units(uid), 0)
  const parse = (await manual.get()).get("parse")
  assert.equal(parse.stage, "error")
  assert.equal(parse.error.message, PARSE_ERR.notStarted)
  assert.equal((await db.doc(`parseCharges/${parse.requestId}`).get()).get("state"), "refunded")
})

test("a duplicate task id means the run IS queued — not a failure", async () => {
  const { homeId, uid } = await seedHome()
  const dup = Object.assign(new Error("exists"), { code: "functions/task-already-exists" })
  const { deps: d } = deps({ enqueueFails: dup })
  const res = await runEnqueueParse(db, d, { uid, homeId, manualId: "m1", mode: "preview" })
  assert.ok(res.requestId)
  assert.equal(await units(uid), 10)
})

test("not a member: refused, nothing charged", async () => {
  const { homeId } = await seedHome()
  const outsider = fresh("outsider")
  await assert.rejects(
    () => runEnqueueParse(db, deps().deps, { uid: outsider, homeId, manualId: "m1", mode: "preview" }),
    (err) => err.code === "permission-denied",
  )
  assert.equal(await units(outsider), 0)
})
