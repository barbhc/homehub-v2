/**
 * The unusable-reply retry (2026-11-17) — the production Claude call
 * (makeCallClaude: the real SDK over a fake HTTP transport) driving the real
 * worker core (runParse) against the Firestore emulator. No API, no cost.
 *
 * Measured that day: Sonnet 5 returned tool arguments that were not arrays, and
 * not repairable, in 4 of 22 calls. Production failed the scan after a paid
 * call and the person had to tap to scan again.
 *
 * What this pins:
 *   - a malformed first reply followed by a good one COMMITS normally: two
 *     calls, the identical request both times, both logged, nothing shown as
 *     failed in between;
 *   - two malformed replies write the humanized error ONCE: exactly two calls,
 *     no Cloud Tasks retry even with an attempt left, the charge stays spent
 *     (Claude answered — it is not refunded), and a duplicate delivery makes
 *     no third call and does not touch the error;
 *   - an answer that was paid for is never refunded, however the call ends:
 *     a retry that then hits an overloaded API waits for Cloud Tasks (and is
 *     still charged once), and on the last attempt fails WITHOUT a refund;
 *     a decline (refusal) is still refunded, as before;
 *   - the retry is not taken when it cannot help (cut off at max_tokens) or
 *     cannot finish (the attempt's Claude budget is nearly gone);
 *   - the unforced (Opus) route shares the same single retry, and two replies
 *     without the tool call are billed like two malformed ones.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { CLAUDE_USAGE_MESSAGE } from "../lib/firebase/functions/src/lib/claudeUsage.js"
import { CLAUDE_MIN_WINDOW_MS, makeCallClaude } from "../lib/firebase/functions/src/parse/anthropic.js"
import { isTransientParseError } from "../lib/firebase/functions/src/parse/errorClass.js"
import { runParse } from "../lib/firebase/functions/src/parse/runParse.js"
import { PARSE_ERR } from "../lib/shared/parse/parseErrors.js"
import { MalformedExtractionError, NoToolCallError } from "../lib/shared/parse/parsePrompt.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()
const NOW = new Date("2026-06-23T00:00:00Z")
const DAY = "2029-02-15"
const MONTH = "2029-02"
const SONNET = "claude-sonnet-5"
const OPUS = "claude-opus-5-5"

let n = 0
const fresh = (label) => `malf-${label}-${Date.now()}-${n++}`
const soon = () => Date.now() + 10 * 60_000

// ─── replies, as the Messages API sends them ─────────────────────────────────

const GOOD = {
  chunks: [{ chunk_type: "care", content: "Wipe the seals monthly.", title: "Care", source_pages: [3] }],
  tasks: [{ title: "Clean the filter", schedule_type: "monthly", care_type: "maintenance", priority_tier: "recommended", risk_level: "performance" }],
  confidence: { overall: 0.9, safety: 0.9, how_to: 0.9, care: 0.9, troubleshooting: 0.8, notes: "" },
}
/** nespresso-vertuo, 2026-11-17: `tasks` is a string, and the JSON inside it is invalid (an unquoted key). */
const MALFORMED_TASKS_STRING = {
  chunks: GOOD.chunks,
  tasks: '[\n{"title":"Rinse and Fill Water Tank","description":"Rinse the tank."},\n{"title":"Run Initial Cleaning Cycles",description:"Run the 3-cycle clean."}\n]',
}
/** blender-beast, 2026-11-17: `chunks` is a string that swallowed the rest of the object, unbalanced inside; `tasks` is missing. */
const MALFORMED_SWALLOWED = {
  chunks: '[\n{"chunk_type":"specs","title":"Blend times","table_data":[{"rows":[["GRINDING","20s"]]]},"applies_to":[]}],\n"tasks":[{"title":"Clean the vessel"}],\n"manufactured_year":2020}\n',
}

const message = (model, content, stop_reason = "tool_use") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model,
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 120_000, output_tokens: 9_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
})
const toolReply = (input, stop_reason) => message(SONNET, [{ type: "tool_use", id: "toolu_test", name: "record_extraction", input }], stop_reason)

/** A Messages API that answers each request with the next reply in `replies`, and records every body it was sent. */
function fakeAnthropic(replies) {
  const bodies = []
  const fetch = async (_url, init) => {
    bodies.push(String(init.body))
    const next = replies[bodies.length - 1]
    assert.ok(next, `the worker made call ${bodies.length}, but only ${replies.length} were expected`)
    if (next.httpStatus) {
      // An API error. `retry-after-ms` keeps the SDK's own one retry fast.
      return new Response(JSON.stringify({ type: "error", error: { type: next.errorType, message: next.errorType } }), {
        status: next.httpStatus,
        headers: { "content-type": "application/json", "retry-after-ms": "5" },
      })
    }
    return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } })
  }
  return { fetch, bodies }
}
const OVERLOADED = { httpStatus: 529, errorType: "overloaded_error" }

/** The Opus route streams: the same message, as the SSE events the SDK reassembles. */
function sseOf(msg) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  let out = ev("message_start", { message: { ...msg, content: [], stop_reason: null } })
  msg.content.forEach((block, index) => {
    if (block.type === "tool_use") {
      out += ev("content_block_start", { index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } })
      out += ev("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } })
    } else {
      out += ev("content_block_start", { index, content_block: { type: "text", text: "" } })
      out += ev("content_block_delta", { index, delta: { type: "text_delta", text: block.text } })
    }
    out += ev("content_block_stop", { index })
  })
  out += ev("message_delta", { delta: { stop_reason: msg.stop_reason, stop_sequence: null }, usage: { output_tokens: msg.usage.output_tokens } })
  return out + ev("message_stop", {})
}
function fakeAnthropicStream(replies) {
  const bodies = []
  const fetch = async (_url, init) => {
    bodies.push(String(init.body))
    const next = replies[bodies.length - 1]
    assert.ok(next, `the worker made call ${bodies.length}, but only ${replies.length} were expected`)
    return new Response(sseOf(next), { status: 200, headers: { "content-type": "text/event-stream" } })
  }
  return { fetch, bodies }
}

/** Run `fn`; collect the structured usage lines and the console.warn lines it produced. */
async function logsDuring(fn) {
  const usage = []
  const warns = []
  const write = process.stdout.write
  const warn = console.warn
  process.stdout.write = function (chunk, ...rest) {
    const s = String(chunk)
    if (s.includes(`"message":"${CLAUDE_USAGE_MESSAGE}"`)) {
      usage.push(JSON.parse(s))
      return true
    }
    return write.call(process.stdout, chunk, ...rest)
  }
  console.warn = (...args) => warns.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
  try {
    return { result: await fn(), usage, warns }
  } finally {
    process.stdout.write = write
    console.warn = warn
  }
}

// ─── the manual, the run, and its charge ─────────────────────────────────────

/** A manual queued for run `requestId`, with the ledger entry and the 10 units it charged. */
async function seedRun({ requestId, mode = "commit", itemCategory = "small_appliance" }) {
  const homeId = fresh("home")
  const uid = fresh("uid")
  const manual = db.doc(`homes/${homeId}/manuals/m1`)
  // pickParseModel: an appliance is read by Sonnet 5 (forced tool); a "system" escalates to Opus 5.5 (unforced).
  await db.doc(`homes/${homeId}/items/item1`).set({ displayName: "Nespresso Vertuo", itemCategory })
  await manual.set({
    itemUnitId: "item1",
    sourceType: "upload",
    sourceRef: "manuals/item1.pdf",
    title: "Manual",
    parse: { requestId, stage: "queued", stageAt: Timestamp.now(), mode },
  })
  await db.doc(`usage/${uid}/daily/${DAY}`).set({ units: 10, count: 1 })
  await db.doc(`parseCharges/${requestId}`).set({ uid, fn: "enqueueParse", units: 10, day: DAY, month: MONTH, state: "held", homeId, manualId: "m1" })
  return { homeId, manual, uid }
}
const units = async (uid) => (await db.doc(`usage/${uid}/daily/${DAY}`).get()).get("units")
const ledgerState = async (requestId) => (await db.doc(`parseCharges/${requestId}`).get()).get("state")
const countOf = async (path) => (await db.collection(path).count().get()).data().count

/**
 * Every `parse` state the manual passes through, from the queued state on.
 * `ready` resolves on the first snapshot, so the run cannot start before the
 * watch is listening (otherwise the first stages are simply not seen, and an
 * assertion about them passes or fails by timing).
 */
function watchParse(manual) {
  const seen = []
  let stop
  const ready = new Promise((resolve, reject) => {
    stop = manual.onSnapshot((snap) => {
      seen.push(snap.get("parse"))
      resolve()
    }, reject)
  })
  /**
   * Stop once the listener has delivered the manual's CURRENT server state —
   * not after a fixed wait, which would pass or fail by timing. Nothing writes
   * to the manual after runParse returns, so the current state is the last.
   */
  const finish = async () => {
    const last = (await manual.get()).get("parse")
    const key = (p) => `${p?.stage}@${p?.stageAt?.toMillis()}`
    for (let waited = 0; key(seen.at(-1)) !== key(last); waited += 20) {
      assert.ok(waited < 5000, `the listener never delivered ${key(last)}; it last saw ${key(seen.at(-1))}`)
      await new Promise((r) => setTimeout(r, 20))
    }
    stop()
    return seen.map((p) => p.stage)
  }
  return { seen, ready, finish }
}

/** The worker's dependencies, with the production Claude call over `api`. */
const deps = (api, opts = {}) => ({
  fetchPdf: async () => "JVBERi0xLjQK",
  callClaude: makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch, logFields: { manualId: "m1" }, ...opts }),
})

// ─── malformed, then good: the scan succeeds ─────────────────────────────────

for (const [label, malformed] of [
  ["`tasks` a string of invalid JSON", MALFORMED_TASKS_STRING],
  ["`chunks` a string that swallowed the object", MALFORMED_SWALLOWED],
]) {
  test(`a malformed first reply (${label}) followed by a good one commits normally`, async () => {
    const req = fresh("req")
    const { homeId, manual, uid } = await seedRun({ requestId: req })
    const api = fakeAnthropic([toolReply(malformed), toolReply(GOOD)])
    // Every stage the manual was ever in, so "never showed an error" is observed, not inferred.
    const watch = watchParse(manual)
    await watch.ready

    const { result: out, usage, warns } = await logsDuring(() =>
      // An attempt IS left: the retry must be the in-process one, not Cloud Tasks'.
      runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: false }),
    )
    const stages = await watch.finish()

    assert.equal(out.stage, "done")
    assert.equal(out.retry, undefined, "nothing is handed to Cloud Tasks")
    assert.deepEqual(out.summary, { chunks: 1, tasks: 1 })

    // Two calls, and the second is the SAME request — not a reworded or softened one.
    assert.equal(api.bodies.length, 2)
    assert.equal(api.bodies[1], api.bodies[0])
    assert.deepEqual(JSON.parse(api.bodies[0]).tool_choice, { type: "tool", name: "record_extraction" })

    // Both paid calls are on the record, and the retry says why it happened.
    assert.deepEqual(usage.map((l) => l.call), [1, 2])
    const retryLines = warns.filter((w) => w.includes("unusable extraction reply"))
    assert.equal(retryLines.length, 1)
    assert.match(retryLines[0], /call 1 of 2/)
    assert.match(retryLines[0], /MalformedExtractionError/)

    // Committed, from the good reply.
    const parse = (await manual.get()).get("parse")
    assert.equal(parse.stage, "done")
    assert.equal(parse.error, null)
    assert.equal(parse.summary.tasks, 1)
    assert.equal(await countOf(`homes/${homeId}/manuals/m1/chunks`), 1)
    const templates = await db.collection(`homes/${homeId}/taskTemplates`).get()
    assert.deepEqual(templates.docs.map((d) => d.get("title")), ["Clean the filter"])

    // The person never saw a failure, and the run never went back to the queue.
    const path = stages.join(" → ")
    assert.equal(stages[0], "queued", path)
    assert.equal(stages.at(-1), "done", path)
    assert.ok(!stages.includes("error"), path)
    assert.ok(!stages.slice(1).includes("queued"), `the run went back to the queue: ${path}`)

    // One scan, one charge: spent, not refunded, and not charged twice.
    assert.equal(await ledgerState(req), "billed")
    assert.equal(await units(uid), 10)
  })
}

// ─── malformed twice: one error, once ────────────────────────────────────────

test("two malformed replies write the humanized error once — two calls, no third, no refund", async () => {
  const req = fresh("req")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  const api = fakeAnthropic([toolReply(MALFORMED_TASKS_STRING), toolReply(MALFORMED_SWALLOWED)])
  const watch = watchParse(manual)
  await watch.ready

  const { result: out, usage } = await logsDuring(() =>
    // Not the final attempt: if this error were treated as transient, runParse
    // would park the run at `queued` and Cloud Tasks would pay for two more calls.
    runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: false }),
  )

  assert.equal(api.bodies.length, 2, "one call and exactly one retry")
  assert.deepEqual(usage.map((l) => l.call), [1, 2])
  assert.equal(out.stage, "error")
  assert.equal(out.retry, undefined, "permanent: Cloud Tasks is not asked to try again")
  assert.equal(out.error, PARSE_ERR.unusableReply)

  const parse = (await manual.get()).get("parse")
  assert.equal(parse.stage, "error")
  // What the person reads is a sentence; the diagnosis is kept beside it.
  assert.equal(parse.error.message, PARSE_ERR.unusableReply)
  assert.doesNotMatch(parse.error.message, /malformed|chunks|tasks|array/)
  assert.match(parse.error.raw, /^malformed extraction: chunks\/tasks not arrays \(chunks string\(\d+\), tasks missing\)$/)
  assert.equal(parse.error.stage, "claude_responded", "Claude answered; the failure is in what it said")
  assert.equal(parse.retry ?? null, null)

  // Nothing committed from either reply.
  assert.equal(await countOf(`homes/${homeId}/manuals/m1/chunks`), 0)
  assert.equal(await countOf(`homes/${homeId}/taskTemplates`), 0)

  // Claude answered both calls and both were billed: the charge is spent.
  assert.equal(out.refunded, false)
  assert.equal(await ledgerState(req), "billed")
  assert.equal(await units(uid), 10)

  // A duplicate delivery of the same task: no third call, the error untouched.
  const again = await runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: true })
  assert.equal(again.stale, true)
  assert.equal(api.bodies.length, 2)
  const stages = await watch.finish()
  // Each write to the manual is one snapshot: exactly one of them is the error,
  // it is the last, and nothing after it changed what the person was told.
  assert.equal(stages.filter((s) => s === "error").length, 1, stages.join(" → "))
  assert.equal(stages.at(-1), "error", stages.join(" → "))
  assert.ok(!stages.slice(1).includes("queued"), `the run went back to the queue: ${stages.join(" → ")}`)
  assert.equal((await manual.get()).get("parse.error.at").toMillis(), watch.seen.at(-1).error.at.toMillis())
})

// ─── a paid answer is never refunded, however the call ends ──────────────────

test("malformed, then the retry hits an overloaded API: waits for Cloud Tasks, charged once, and the next attempt finishes it", async () => {
  const req = fresh("req")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  // Call 1 answers (malformed, paid). Call 2 is refused with 529 — twice, the SDK's own one retry included.
  const api = fakeAnthropic([toolReply(MALFORMED_TASKS_STRING), OVERLOADED, OVERLOADED])
  const { result: out } = await logsDuring(() =>
    runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: false }),
  )
  assert.equal(api.bodies.length, 3)
  assert.equal(out.retry, true, "an overloaded API is transient: Cloud Tasks gets its one retry")
  const parked = (await manual.get()).get("parse")
  assert.equal(parked.stage, "queued")
  assert.equal(parked.error ?? null, null, "nothing is shown as failed while a retry is coming")
  // The first answer was paid for: spent already, whatever the retry does.
  assert.equal(await ledgerState(req), "billed")
  assert.equal(await units(uid), 10)

  // Cloud Tasks' retry: a clean reply. Done, and still exactly one charge.
  const api2 = fakeAnthropic([toolReply(GOOD)])
  const { result: second } = await logsDuring(() =>
    runParse(db, deps(api2), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: true }),
  )
  assert.equal(second.stage, "done")
  assert.equal((await manual.get()).get("parse.stage"), "done")
  assert.equal(await ledgerState(req), "billed")
  assert.equal(await units(uid), 10)
})

test("the same on the LAST attempt: an error, and no refund — Claude was paid for the first answer", async () => {
  const req = fresh("req")
  const { homeId, manual, uid } = await seedRun({ requestId: req })
  const api = fakeAnthropic([toolReply(MALFORMED_SWALLOWED), OVERLOADED, OVERLOADED])
  const { result: out } = await logsDuring(() =>
    runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: true }),
  )
  assert.equal(out.stage, "error")
  assert.equal(out.refunded, false, "a refund here would give back a scan Anthropic was paid for")
  assert.equal(await ledgerState(req), "billed")
  assert.equal(await units(uid), 10)
  const parse = (await manual.get()).get("parse")
  assert.equal(parse.stage, "error")
  assert.doesNotMatch(parse.error.message, /overloaded|529|\{/, "humanized, never raw API text")
})

test("no answer at all (overloaded from the first call) is still refunded on the last attempt", async () => {
  const req = fresh("req")
  const { homeId, uid } = await seedRun({ requestId: req })
  const api = fakeAnthropic([OVERLOADED, OVERLOADED])
  const { result: out } = await logsDuring(() =>
    runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: true }),
  )
  assert.equal(out.stage, "error")
  assert.equal(out.refunded, true, "Anthropic produced nothing — the user does not pay")
  assert.equal(await ledgerState(req), "refunded")
  assert.equal(await units(uid), 0)
})

test("a decline (refusal) is not an answer: no retry, and the scan is refunded as before", async () => {
  const req = fresh("req")
  const { homeId, uid } = await seedRun({ requestId: req })
  const api = fakeAnthropic([message(SONNET, [{ type: "text", text: "I can't help with that." }], "refusal")])
  const { result: out } = await logsDuring(() =>
    runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: false }),
  )
  assert.equal(api.bodies.length, 1)
  assert.equal(out.stage, "error")
  assert.equal(out.retry, undefined)
  assert.equal(out.refunded, true)
  assert.equal(await ledgerState(req), "refunded")
  assert.equal(await units(uid), 0)
})

test("Opus: two replies without the tool call — the error once, a sentence, and no refund", async () => {
  const req = fresh("req")
  const { homeId, manual, uid } = await seedRun({ requestId: req, itemCategory: "system" })
  const noCall = message(OPUS, [{ type: "text", text: "Here is the extraction you asked for." }], "end_turn")
  const api = fakeAnthropicStream([noCall, noCall])
  const { result: out } = await logsDuring(() =>
    runParse(db, deps(api), { homeId, manualId: "m1", requestId: req, mode: "commit", now: NOW, finalAttempt: false }),
  )
  assert.equal(JSON.parse(api.bodies[0]).model, OPUS, "this item is read on the unforced route")
  assert.equal(api.bodies.length, 2)
  assert.equal(out.stage, "error")
  assert.equal(out.retry, undefined)
  const parse = (await manual.get()).get("parse")
  assert.equal(parse.error.message, PARSE_ERR.unusableReply)
  assert.match(parse.error.raw, /did not call record_extraction/)
  // Two Opus calls were paid for. (Until 2026-11-17 this run was refunded.)
  assert.equal(out.refunded, false)
  assert.equal(await ledgerState(req), "billed")
  assert.equal(await units(uid), 10)
})

test("each paid answer is reported as it arrives — twice for malformed-then-good, never for a decline", async () => {
  const count = async (replies) => {
    const api = fakeAnthropic(replies)
    let answers = 0
    const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch })
    // Three of these calls reject by design; what is asserted is how many answers were reported first.
    await logsDuring(() => call({ model: SONNET, pdfBase64: "JVBERi0xLjQK", prompt: "p", onReply: () => (answers += 1) }).catch(() => undefined))
    return answers
  }
  assert.equal(await count([toolReply(GOOD)]), 1)
  assert.equal(await count([toolReply(MALFORMED_TASKS_STRING), toolReply(GOOD)]), 2)
  assert.equal(await count([toolReply(MALFORMED_TASKS_STRING), OVERLOADED, OVERLOADED]), 1)
  assert.equal(await count([message(SONNET, [{ type: "text", text: "No." }], "refusal")]), 0)
})

// ─── when the retry is not taken ─────────────────────────────────────────────

test("a reply cut off at max_tokens is not retried — the second call would be cut off too", async () => {
  // A truncated tool call arrives with whatever arguments were complete: here, none.
  const api = fakeAnthropic([toolReply({}, "max_tokens")])
  const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch })
  const { warns } = await logsDuring(() =>
    assert.rejects(
      () => call({ model: SONNET, pdfBase64: "JVBERi0xLjQK", prompt: "p" }),
      (e) => e instanceof MalformedExtractionError && !isTransientParseError(e),
    ),
  )
  assert.equal(api.bodies.length, 1)
  assert.equal(warns.filter((w) => w.includes("unusable extraction reply")).length, 0)
})

test("with too little of the attempt's Claude budget left, the retry is not started", async () => {
  const api = fakeAnthropic([toolReply(MALFORMED_TASKS_STRING)])
  // Enough budget to start the first call; the reply takes long enough that
  // less than the minimum window is left when it lands.
  const slow = async (url, init) => {
    await new Promise((r) => setTimeout(r, 400))
    return api.fetch(url, init)
  }
  const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: Date.now() + CLAUDE_MIN_WINDOW_MS + 200, fetch: slow })
  await logsDuring(() =>
    assert.rejects(
      () => call({ model: SONNET, pdfBase64: "JVBERi0xLjQK", prompt: "p" }),
      (e) => e instanceof MalformedExtractionError,
    ),
  )
  assert.equal(api.bodies.length, 1, "a retry that cannot finish is a paid call for nothing")
})

test("a good reply is returned after one call, with repaired arguments handed back as arrays", async () => {
  // Repairable (valid JSON inside the string): not a failure, and not a retry.
  const api = fakeAnthropic([toolReply({ chunks: JSON.stringify(GOOD.chunks), tasks: GOOD.tasks })])
  const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch })
  const { result: out } = await logsDuring(() => call({ model: SONNET, pdfBase64: "JVBERi0xLjQK", prompt: "p" }))
  assert.equal(api.bodies.length, 1)
  assert.deepEqual(out.content[0].input.chunks, GOOD.chunks)
  assert.deepEqual(out.content[0].input.tasks, GOOD.tasks)
})

// ─── the unforced (Opus) route shares the one retry ──────────────────────────

test("Opus: no tool call, then a malformed call — still two calls in all, then the typed error", async () => {
  const api = fakeAnthropicStream([
    message(OPUS, [{ type: "text", text: "Here is the extraction you asked for." }], "end_turn"),
    message(OPUS, [{ type: "tool_use", id: "toolu_test", name: "record_extraction", input: MALFORMED_SWALLOWED }]),
  ])
  const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch })
  const { warns } = await logsDuring(() =>
    assert.rejects(
      () => call({ model: OPUS, pdfBase64: "JVBERi0xLjQK", prompt: "p" }),
      (e) => e instanceof MalformedExtractionError,
    ),
  )
  assert.equal(api.bodies.length, 2, "one retry for the extraction, whichever fault each reply had")
  const retryLines = warns.filter((w) => w.includes("unusable extraction reply"))
  assert.equal(retryLines.length, 1)
  assert.match(retryLines[0], /NoToolCallError/)
})

test("Opus: no tool call twice is still NoToolCallError after two calls", async () => {
  const noCall = message(OPUS, [{ type: "text", text: "Here you go." }], "end_turn")
  const api = fakeAnthropicStream([noCall, noCall])
  const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch })
  await logsDuring(() =>
    assert.rejects(
      () => call({ model: OPUS, pdfBase64: "JVBERi0xLjQK", prompt: "p" }),
      (e) => e instanceof NoToolCallError,
    ),
  )
  assert.equal(api.bodies.length, 2)
})
