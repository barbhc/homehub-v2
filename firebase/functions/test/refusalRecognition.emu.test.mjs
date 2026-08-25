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
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { errorForVerdict, errorForRate } from "../lib/firebase/functions/src/lib/quota.js"
import { isQuotaExhaustedMessage } from "../lib/shared/quota/refusal.js"
import { AI_DAILY_CALL_LIMIT, DAILY_AI_LIMIT } from "../lib/shared/quota/policy.js"

test("every CEILING refusal reads as a ceiling to the client", () => {
  const ceilings = [
    errorForVerdict("daily", DAILY_AI_LIMIT),
    errorForVerdict("global", DAILY_AI_LIMIT),
    errorForVerdict("fnDaily", DAILY_AI_LIMIT, {
      fn: "enqueueParse",
      fnLimit: AI_DAILY_CALL_LIMIT.enqueueParse,
    }),
    // Any future capped function, worded generically.
    errorForVerdict("fnDaily", DAILY_AI_LIMIT, { fn: "somethingElse", fnLimit: 7 }),
  ]
  for (const err of ceilings) {
    assert.ok(
      isQuotaExhaustedMessage(err.message),
      `client would treat this as a hard failure: "${err.message}"`,
    )
    assert.equal(err.code, "resource-exhausted")
    assert.equal(err.details?.kind, "quota_exhausted")
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
  assert.equal(AI_DAILY_CALL_LIMIT.enqueueParse, 50)
  const err = errorForVerdict("fnDaily", DAILY_AI_LIMIT, {
    fn: "enqueueParse",
    fnLimit: AI_DAILY_CALL_LIMIT.enqueueParse,
  })
  assert.match(err.message, /50 manual scans today/)
  // Says the work is kept — the retry job is what makes that true.
  assert.match(err.message, /saved and queued/i)
})
