/**
 * The stalled-parse sweep (C1) — against the Firestore emulator.
 *
 * A worker killed mid-run left its manual at an active stage forever: the
 * page said "Reading the manual" indefinitely and the home lost an in-flight
 * slot for good. The sweep ends such runs as an error the UI already shows,
 * refunds them if they never reached Claude, and leaves live runs alone.
 *
 * The sweep's query is app-wide and node --test runs the suites concurrently
 * against one emulator, so every call here is scoped to this file's homes.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runStalledParseSweep } from "../lib/firebase/functions/src/parse/stalledParseSweep.js"
import { runParse } from "../lib/firebase/functions/src/parse/runParse.js"
import { PARSE_ERR } from "../lib/shared/parse/parseErrors.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const PREFIX = "stall-"
let n = 0
const fresh = (label) => `${PREFIX}${label}-${Date.now()}-${n++}`
const mine = (homeId) => homeId.startsWith(PREFIX)
const MIN = 60_000
const agoTs = (ms) => Timestamp.fromMillis(Date.now() - ms)

async function seedManual({ stage, ageMs, ledger = null }) {
  const homeId = fresh("home")
  const requestId = fresh("req")
  const uid = fresh("uid")
  const ref = db.doc(`homes/${homeId}/manuals/m1`)
  await db.doc(`homes/${homeId}/items/i1`).set({ displayName: "Furnace" })
  await ref.set({ itemUnitId: "i1", sourceType: "upload", sourceRef: "manuals/f.pdf", parse: { stage, stageAt: agoTs(ageMs), requestId, mode: "preview" } })
  if (ledger) {
    await db.doc(`usage/${uid}/daily/2026-09-30`).set({ units: 10, count: 1 })
    await db.doc(`parseCharges/${requestId}`).set({ uid, fn: "enqueueParse", units: 10, day: "2026-09-30", month: "2026-09", state: ledger })
  }
  return { ref, requestId, uid }
}

test("a stalled run becomes an error the page can show — same requestId, calm copy — and is refunded", async () => {
  const s = await seedManual({ stage: "started", ageMs: 40 * MIN, ledger: "held" })
  const res = await runStalledParseSweep(db, Date.now(), { scope: mine })
  assert.ok(res.ended >= 1)
  const parse = (await s.ref.get()).get("parse")
  assert.equal(parse.stage, "error")
  assert.equal(parse.requestId, s.requestId, "a client following this run sees it end")
  assert.equal(parse.error.message, PARSE_ERR.stalled)
  assert.equal(parse.error.stage, "started")
  assert.equal((await db.doc(`parseCharges/${s.requestId}`).get()).get("state"), "refunded")
  assert.equal((await db.doc(`usage/${s.uid}/daily/2026-09-30`).get()).get("units"), 0)
})

test("a stalled run whose Claude call had started is ended but NOT refunded — the sweep cannot know it was free", async () => {
  const s = await seedManual({ stage: "claude_call", ageMs: 50 * MIN, ledger: "vendor" })
  await runStalledParseSweep(db, Date.now(), { scope: mine })
  assert.equal((await s.ref.get()).get("parse.stage"), "error")
  assert.equal((await db.doc(`parseCharges/${s.requestId}`).get()).get("state"), "vendor")
})

test("a live run (written 5 minutes ago) is left alone", async () => {
  const s = await seedManual({ stage: "claude_call", ageMs: 5 * MIN })
  await runStalledParseSweep(db, Date.now(), { scope: mine })
  assert.equal((await s.ref.get()).get("parse.stage"), "claude_call")
})

test("a stage with no usable time is treated as stalled, not as live forever", async () => {
  const s = await seedManual({ stage: "queued", ageMs: 0 })
  await s.ref.set({ parse: { stageAt: null } }, { merge: true })
  await runStalledParseSweep(db, Date.now(), { scope: mine })
  assert.equal((await s.ref.get()).get("parse.stage"), "error")
})

test("finished and parked manuals are not touched", async () => {
  const done = await seedManual({ stage: "done", ageMs: 90 * MIN })
  const parked = await seedManual({ stage: "awaiting_capacity", ageMs: 90 * MIN })
  await runStalledParseSweep(db, Date.now(), { scope: mine })
  assert.equal((await done.ref.get()).get("parse.stage"), "done")
  assert.equal((await parked.ref.get()).get("parse.stage"), "awaiting_capacity")
})

test("the dead worker's late delivery cannot revive the swept run", async () => {
  const s = await seedManual({ stage: "pdf_fetched", ageMs: 45 * MIN })
  await runStalledParseSweep(db, Date.now(), { scope: mine })
  let claudeCalls = 0
  const out = await runParse(
    db,
    { fetchPdf: async () => "", callClaude: async () => { claudeCalls += 1; return { content: [] } } },
    { homeId: s.ref.parent.parent.id, manualId: "m1", requestId: s.requestId, mode: "preview" },
  )
  assert.equal(out.stale, true)
  assert.equal(claudeCalls, 0)
  assert.equal((await s.ref.get()).get("parse.stage"), "error")
})
