/**
 * Every refusal the server can produce must be recognised by the client.
 *
 * `startParse` keeps only `err.message` — the structured details are discarded
 * at that boundary — so the client decides "is this a ceiling or a failure?"
 * by matching the SENTENCE the functions package wrote. That coupling was
 * invisible: adding the 50-scan cap added a refusal message no client pattern
 * matched, which would have shown a queued scan as a hard error with a dead
 * "Try again" — the exact experience HH-124 was raised about.
 *
 * This is the thing that goes red instead. Copy stays free to change; what
 * cannot change silently is whether the client still understands it.
 *
 * The OLD matcher matters too: a functions deploy lands before (or without) a
 * hosting deploy, so the client in people's hands still has the matcher from
 * before this change. Every sentence is checked against a frozen copy of it.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { errorForVerdict, errorForRate } from "../lib/firebase/functions/src/lib/quota.js"
import { isQuotaExhaustedMessage } from "../lib/shared/quota/refusal.js"
import { dailyCallLimitFor } from "../lib/shared/quota/policy.js"

/** The matcher as deployed on 2026-09-29 (shared/quota/refusal.ts at eae6fc9). */
const DEPLOYED_CLIENT_MATCHER =
  /daily ai limit|monthly ai budget|resource[- ]exhausted|too many requests|manual scans today|daily limit reached for this action/i

const everyCeiling = () => [
  errorForVerdict("daily", { fn: "enqueueParse" }),
  errorForVerdict("daily", { fn: "chatQuery" }),
  errorForVerdict("daily"),
  errorForVerdict("global", { fn: "enqueueParse" }),
  errorForVerdict("global", { fn: "chatQuery" }),
  errorForVerdict("fnDaily", { fn: "enqueueParse", fnLimit: dailyCallLimitFor("enqueueParse") }),
  // scansPerDay: 0 in config/spend — scanning paused.
  errorForVerdict("fnDaily", { fn: "enqueueParse", fnLimit: 0 }),
  // Any future capped function, worded generically.
  errorForVerdict("fnDaily", { fn: "somethingElse", fnLimit: 7 }),
]

test("every CEILING refusal reads as a ceiling to the client", () => {
  for (const err of everyCeiling()) {
    assert.ok(
      isQuotaExhaustedMessage(err.message),
      `client would treat this as a hard failure: "${err.message}"`,
    )
    assert.equal(err.code, "resource-exhausted")
    assert.equal(err.details?.kind, "quota_exhausted")
  }
})

test("…including by the client already in people's hands", () => {
  for (const err of everyCeiling()) {
    assert.ok(DEPLOYED_CLIENT_MATCHER.test(err.message), `the deployed client would show a hard error for: "${err.message}"`)
  }
})

test("a RATE limit is NOT a ceiling — it means wait seconds, not come back tomorrow", () => {
  // Parking these would queue work the user is about to redo by hand, and the
  // copy would promise a retry for something that needs a nine-second pause.
  for (const err of [errorForRate("endpoint", 9), errorForRate("burst", 3)]) {
    assert.equal(isQuotaExhaustedMessage(err.message), false, err.message)
    assert.equal(err.details?.kind, "rate_limited")
  }
})

test("a real failure is never dressed up as a ceiling", () => {
  for (const msg of [
    "That link opened a web page, not a PDF",
    "Invalid PDF structure.",
    "Manual not found.",
    "",
    null,
  ]) {
    assert.equal(isQuotaExhaustedMessage(msg), false, String(msg))
  }
})

test("the scan cap is the owner's number", () => {
  assert.equal(dailyCallLimitFor("enqueueParse"), 50)
  const err = errorForVerdict("fnDaily", { fn: "enqueueParse", fnLimit: dailyCallLimitFor("enqueueParse") })
  assert.match(err.message, /50 manual scans today/)
  // Says the work is kept — the retry job is what makes that true.
  assert.match(err.message, /saved and queued/i)
})

test("'saved and queued' is said only where it is true — a parked scan, not an Ask question", () => {
  // A refused scan is parked and retryAwaitingCapacity starts it later. A
  // refused chat question is simply not answered; telling that person their
  // work was queued was a small lie in the message they read most.
  for (const reason of ["daily", "global"]) {
    assert.match(errorForVerdict(reason, { fn: "enqueueParse" }).message, /saved and queued/i)
    assert.doesNotMatch(errorForVerdict(reason, { fn: "chatQuery" }).message, /queued/i)
  }
})

test("the daily refusal names no number of 'actions' and no clock", () => {
  // Units are not actions — a scan is 10 of them — so "50 actions per day" told
  // someone who had done six things that they had done fifty. HH-124: no UTC.
  for (const fn of ["enqueueParse", "chatQuery"]) {
    const msg = errorForVerdict("daily", { fn }).message
    assert.doesNotMatch(msg, /\d+ actions/)
    assert.doesNotMatch(msg, /UTC|midnight/i)
  }
})
