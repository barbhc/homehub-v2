/**
 * One run, one result (C2) — the parse worker core against the Firestore
 * emulator, with fixture Claude/PDF effects (no API, no cost).
 *
 * What these pin, each a way the old worker spent money or showed the wrong
 * thing:
 *   - every stage write carries its run's requestId;
 *   - a run replaced mid-flight stops at its next write — before the paid call
 *     if it can — and never writes `done` or a draft over the newer run;
 *   - a run that ends without a Claude answer is refunded through the ledger,
 *     exactly once; one that got an answer is never refunded;
 *   - a transient failure with an attempt left waits for the retry (stage back
 *     to `queued`, no `error` shown); a permanent one is written once;
 *   - a run the stalled-parse sweep ended is not revived by a late delivery.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import Anthropic from "@anthropic-ai/sdk"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { runParse } from "../lib/firebase/functions/src/parse/runParse.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()
const NOW = new Date("2026-06-23T00:00:00Z")
const DAY = "2029-01-15"
const MONTH = "2029-01"

let n = 0
const fresh = (label) => `run-${label}-${Date.now()}-${n++}`

const fixture = (title = "Clean the filter") => ({
  content: [
    {
      type: "tool_use",
      name: "record_extraction",
      input: {
        chunks: [{ chunk_type: "care", content: "Wipe the seals monthly.", title: "Care", source_pages: [3] }],
        tasks: [{ title, schedule_type: "monthly", care_type: "maintenance", priority_tier: "recommended", risk_level: "performance" }],
        confidence: { overall: 0.9, safety: 0.9, how_to: 0.9, care: 0.9, troubleshooting: 0.8, notes: "" },
      },
    },
  ],
})

/** A manual queued for run `requestId`, and that run's ledger entry + the
 *  usage it charged (10 units), so refunds are observable. */
async function seedRun({ requestId, uid = fresh("uid"), mode = "preview", ledger = "held" }) {
  const homeId = fresh("home")
  const manual = db.doc(`homes/${homeId}/manuals/m1`)
  await db.doc(`homes/${homeId}/items/item1`).set({ displayName: "Bosch Dishwasher", itemCategory: "major_appliance" })
  await manual.set({
    itemUnitId: "item1",
    sourceType: "upload",
    sourceRef: "manuals/item1.pdf",
    title: "Manual",
    parse: { requestId, stage: "queued", stageAt: Timestamp.now(), mode },
  })
  await db.doc(`usage/${uid}/daily/${DAY}`).set({ units: 10, count: 1 })
  await db.doc(`parseCharges/${requestId}`).set({ uid, fn: "enqueueParse", units: 10, day: DAY, month: MONTH, state: ledger, homeId, manualId: "m1" })
  return { homeId, manual, uid }
}
const units = async (uid) => (await db.doc(`usage/${uid}/daily/${DAY}`).get()).get("units")
const ledgerState = async (requestId) => (await db.doc(`parseCharges/${requestId}`).get()).get("state")

test("every stage write carries the run's requestId — including the one right before the paid call", async () => {
  const req = fresh("req")
  const { homeId, manual } = await seedRun({ requestId: req })
  let atCall = null
  const out = await runParse(
    db,
    {
      fetchPdf: async () => "",
      callClaude: async () => {
        atCall = (await manual.get()).get("parse")
        return fixture()
      },
    },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW },
  )
  assert.equal(out.stage, "done")
  assert.equal(atCall.stage, "claude_call")
  assert.equal(atCall.requestId, req)
  const done = (await manual.get()).get("parse")
  assert.equal(done.stage, "done")
  assert.equal(done.requestId, req, "the done write is stamped too — a watcher can tell whose done it is")
})

test("replaced while downloading: stops BEFORE the paid call, writes nothing over the new run, and is refunded", async () => {
  const req = fresh("old")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  let claudeCalls = 0
  const out = await runParse(
    db,
    {
      fetchPdf: async () => {
        // A new enqueue lands while this run downloads the PDF.
        await manual.set({ parse: { requestId: "newer-run", stage: "queued", stageAt: Timestamp.now() } }, { merge: true })
        return ""
      },
      callClaude: async () => {
        claudeCalls += 1
        return fixture()
      },
    },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW },
  )
  assert.equal(out.stale, true)
  assert.equal(claudeCalls, 0, "the re-check right before callClaude caught it")
  const parse = (await manual.get()).get("parse")
  assert.equal(parse.requestId, "newer-run")
  assert.equal(parse.stage, "queued", "the newer run's state is untouched")
  assert.equal(out.refunded, true)
  assert.equal(await units(uid), 0)
  assert.equal(await ledgerState(req), "refunded")
})

test("replaced while Claude was answering: its done and its draft never reach the newer run, and it stays charged", async () => {
  const req = fresh("old")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  const out = await runParse(
    db,
    {
      fetchPdf: async () => "",
      callClaude: async () => {
        await manual.set({ parse: { requestId: "newer-run", stage: "queued", stageAt: Timestamp.now() } }, { merge: true })
        return fixture("Run-1 task")
      },
    },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW },
  )
  assert.equal(out.stale, true)
  const snap = await manual.get()
  assert.equal(snap.get("parse.requestId"), "newer-run")
  assert.notEqual(snap.get("parse.stage"), "done", "run 1's done must not satisfy run 2's watcher")
  assert.equal(snap.get("previewDraft") ?? null, null, "run 1's draft must not land under run 2")
  assert.equal(out.refunded, false, "Claude answered — the call was billed")
  assert.equal(await units(uid), 10)
  assert.equal(await ledgerState(req), "billed")
})

test("a stale delivery (replaced before it started) is refunded — once", async () => {
  const req = fresh("stale")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  await manual.set({ parse: { requestId: "newer-run", stage: "queued" } }, { merge: true })
  const deps = { fetchPdf: async () => "", callClaude: async () => fixture() }
  const first = await runParse(db, deps, { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW })
  assert.equal(first.stale, true)
  assert.equal(first.refunded, true)
  // Cloud Tasks delivers at least once: a duplicate must not refund again.
  const second = await runParse(db, deps, { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW })
  assert.equal(second.refunded, false)
  assert.equal(await units(uid), 0, "floored, and refunded exactly once")
})

test("transient failure with an attempt left: back to queued for the retry — no error shown, no refund", async () => {
  const req = fresh("transient")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  const overloaded = new Anthropic.InternalServerError(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers())
  const out = await runParse(
    db,
    { fetchPdf: async () => "", callClaude: async () => { throw overloaded } },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW, finalAttempt: false },
  )
  assert.equal(out.retry, true, "the worker must rethrow for Cloud Tasks")
  const parse = (await manual.get()).get("parse")
  assert.equal(parse.stage, "queued")
  assert.equal(parse.requestId, req)
  assert.equal(parse.retry.afterStage, "claude_call")
  assert.equal(parse.error ?? null, null, "no failure is shown for something about to be retried")
  assert.equal(await units(uid), 10, "the retry runs under the same charge")

  // …and the retry claims the run and finishes it.
  const retry = await runParse(db, { fetchPdf: async () => "", callClaude: async () => fixture() }, { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW })
  assert.equal(retry.stage, "done")
  const after = (await manual.get()).get("parse")
  assert.equal(after.retry, null)
  assert.equal(after.attempt, 2)
})

test("the same transient failure on the FINAL attempt is written as an error and refunded", async () => {
  const req = fresh("final")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  const down = new Anthropic.APIConnectionError({ message: "Connection error." })
  const out = await runParse(
    db,
    { fetchPdf: async () => "", callClaude: async () => { throw down } },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW, finalAttempt: true },
  )
  assert.equal(out.stage, "error")
  assert.equal(out.retry ?? false, false)
  assert.equal((await manual.get()).get("parse.stage"), "error")
  assert.equal(out.refunded, true, "Anthropic produced nothing — the user does not pay")
  assert.equal(await units(uid), 0)
})

test("a permanent failure is not retried even with attempts left — written once, refunded", async () => {
  const req = fresh("permanent")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  const invalid = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "The PDF specified was not valid." } }, "bad", new Headers())
  const out = await runParse(
    db,
    { fetchPdf: async () => "", callClaude: async () => { throw invalid } },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW, finalAttempt: false },
  )
  assert.equal(out.retry ?? false, false, "a 400 fails the same way twice — never retried")
  assert.equal(out.stage, "error")
  const parse = (await manual.get()).get("parse")
  assert.equal(parse.stage, "error")
  assert.equal(parse.requestId, req)
  assert.match(parse.error.message, /couldn't read that PDF/i, "humanized, never raw API text")
  assert.equal(await units(uid), 0)
})

test("a malformed answer was billed: error written, NOT refunded", async () => {
  const req = fresh("malformed")
  const { homeId, uid } = await seedRun({ requestId: req })
  const out = await runParse(
    db,
    { fetchPdf: async () => "", callClaude: async () => ({ content: [{ type: "text", text: "Sorry." }] }) },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW },
  )
  assert.equal(out.stage, "error")
  assert.equal(out.refunded, false)
  assert.equal(await units(uid), 10)
})

test("a run the stalled-parse sweep ended is not revived by a late delivery", async () => {
  const req = fresh("swept")
  const { homeId, manual } = await seedRun({ requestId: req })
  // What the sweep writes: error, SAME requestId.
  await manual.set({ parse: { stage: "error", error: { message: "stalled" } } }, { merge: true })
  let claudeCalls = 0
  const out = await runParse(
    db,
    { fetchPdf: async () => "", callClaude: async () => { claudeCalls += 1; return fixture() } },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW },
  )
  assert.equal(out.stale, true)
  assert.equal(claudeCalls, 0)
  assert.equal((await manual.get()).get("parse.stage"), "error", "the error the user was shown stays")
})

test("if the sweep refunded the charge while the run was downloading, the run stops before paying", async () => {
  const req = fresh("refunded")
  const { homeId } = await seedRun({ requestId: req, ledger: "refunded" })
  let claudeCalls = 0
  const out = await runParse(
    db,
    { fetchPdf: async () => "", callClaude: async () => { claudeCalls += 1; return fixture() } },
    { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW },
  )
  assert.equal(out.stale, true)
  assert.equal(claudeCalls, 0)
})

test("a deleted manual is not re-created as a ghost by the error write", async () => {
  const req = fresh("ghost")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  await manual.delete()
  const out = await runParse(db, { fetchPdf: async () => "", callClaude: async () => fixture() }, { homeId, manualId: "m1", requestId: req, mode: "preview", now: NOW })
  assert.equal(out.stage, "error")
  assert.equal((await manual.get()).exists, false)
  assert.equal(await units(uid), 0, "nothing ran, nothing charged")
})
