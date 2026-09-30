/**
 * The parse worker's retry and time rules (C2) — pure, no emulator.
 *
 *   - which failures are worth a second Cloud Tasks attempt (errorClass.ts);
 *   - the Claude call's transport budget fits inside the attempt (anthropic.ts);
 *   - the task payload is checked at the door, and "final attempt" is read
 *     from Cloud Tasks' own retry count (parseWorker.ts).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import Anthropic from "@anthropic-ai/sdk"
import { isTransientParseError, ParseTimeBudgetError, PdfFetchError } from "../lib/firebase/functions/src/parse/errorClass.js"
import {
  CLAUDE_BUDGET_MS,
  CLAUDE_MIN_WINDOW_MS,
  CLAUDE_REQUEST_TIMEOUT_MS,
  CLAUDE_SDK_MAX_RETRIES,
  claudeRequestOptions,
  makeCallClaude,
} from "../lib/firebase/functions/src/parse/anthropic.js"
import { isFinalAttempt, parseTaskPayload } from "../lib/firebase/functions/src/parse/parseWorker.js"
import { PARSE_ATTEMPT_DEADLINE_SECONDS, PARSE_MAX_ATTEMPTS, STALE_PARSE_MS } from "../lib/firebase/functions/src/parse/parseState.js"
import { NoToolCallError } from "../lib/shared/parse/parsePrompt.js"

const H = () => new Headers()
const apiBody = (type) => ({ type: "error", error: { type, message: type } })

// ─── transient or permanent ──────────────────────────────────────────────────

test("Anthropic: overloaded, rate-limited, 5xx, timeouts and dropped connections are worth a retry", () => {
  for (const err of [
    new Anthropic.InternalServerError(529, apiBody("overloaded_error"), "Overloaded", H()),
    new Anthropic.InternalServerError(500, apiBody("api_error"), "Internal", H()),
    new Anthropic.RateLimitError(429, apiBody("rate_limit_error"), "Slow down", H()),
    new Anthropic.APIError(408, apiBody("timeout_error"), "Timeout", H()),
    new Anthropic.APIConnectionError({ message: "Connection error." }),
    new Anthropic.APIConnectionTimeoutError(),
    new Anthropic.APIUserAbortError(), // our own time budget firing
  ]) {
    assert.equal(isTransientParseError(err), true, `${err.constructor.name}: ${err.message}`)
  }
})

test("Anthropic: a mid-stream error event (no HTTP status) is judged by its type", () => {
  assert.equal(isTransientParseError(new Anthropic.APIError(undefined, apiBody("overloaded_error"), undefined, H())), true)
  assert.equal(isTransientParseError(new Anthropic.APIError(undefined, apiBody("invalid_request_error"), undefined, H())), false)
})

test("Anthropic: a bad request, bad key, or a model that answered wrong fails the same way twice — never retried", () => {
  for (const err of [
    new Anthropic.BadRequestError(400, apiBody("invalid_request_error"), "The PDF specified was not valid.", H()),
    new Anthropic.AuthenticationError(401, apiBody("authentication_error"), "invalid x-api-key", H()),
    new Anthropic.PermissionDeniedError(403, apiBody("permission_error"), "no", H()),
    new Anthropic.NotFoundError(404, apiBody("not_found_error"), "model", H()),
    new NoToolCallError("end_turn"),
    new Error("malformed extraction: chunks/tasks not arrays"),
  ]) {
    assert.equal(isTransientParseError(err), false, `${err.constructor.name}: ${err.message}`)
  }
})

test("the download: a site that is down is retried; one that refuses us is not", () => {
  assert.equal(isTransientParseError(new PdfFetchError("The site wouldn't let us download that link (HTTP 503).", 503)), true)
  assert.equal(isTransientParseError(new PdfFetchError("The site wouldn't let us download that link (HTTP 403).", 403)), false)
  assert.equal(isTransientParseError(new PdfFetchError("…(HTTP 404).", 404)), false)
  assert.equal(isTransientParseError(new TypeError("fetch failed", { cause: Object.assign(new Error("socket"), { code: "UND_ERR_SOCKET" }) })), true)
  assert.equal(isTransientParseError(Object.assign(new Error("reset"), { code: "ECONNRESET" })), true)
  assert.equal(isTransientParseError(Object.assign(new Error("timed out"), { name: "TimeoutError" })), true)
})

test("Firestore (gRPC) and Cloud Storage (HTTP) codes", () => {
  assert.equal(isTransientParseError(Object.assign(new Error("unavailable"), { code: 14 })), true)
  assert.equal(isTransientParseError(Object.assign(new Error("deadline"), { code: 4 })), true)
  assert.equal(isTransientParseError(Object.assign(new Error("denied"), { code: 7 })), false)
  assert.equal(isTransientParseError(Object.assign(new Error("No such object"), { code: 404 })), false)
  assert.equal(isTransientParseError(Object.assign(new Error("backend"), { code: 503 })), true)
})

test("running out of the attempt's time is transient — the next attempt has a fresh budget", () => {
  assert.equal(isTransientParseError(new ParseTimeBudgetError()), true)
})

test("non-errors are not transient", () => {
  for (const v of [null, undefined, "oops", 42]) assert.equal(isTransientParseError(v), false)
})

// ─── the time budget ─────────────────────────────────────────────────────────

test("the budget arithmetic: every SDK try fits the Claude budget, which fits the attempt with room to commit", () => {
  assert.ok((CLAUDE_SDK_MAX_RETRIES + 1) * CLAUDE_REQUEST_TIMEOUT_MS <= CLAUDE_BUDGET_MS, "SDK tries × per-request timeout ≤ budget")
  assert.ok(CLAUDE_BUDGET_MS <= PARSE_ATTEMPT_DEADLINE_SECONDS * 1000 - 5 * 60_000, "≥5 minutes left for the commit")
  assert.ok(STALE_PARSE_MS > PARSE_ATTEMPT_DEADLINE_SECONDS * 1000, "a live attempt can never look stalled")
  assert.equal(CLAUDE_SDK_MAX_RETRIES, 1, "the SDK default of 2 is what used to eat the whole attempt")
})

test("each request carries the per-request timeout, one SDK retry, and a signal for what is left", () => {
  const now = 1_000_000
  const o = claudeRequestOptions(now + CLAUDE_BUDGET_MS, now)
  assert.equal(o.timeout, CLAUDE_REQUEST_TIMEOUT_MS)
  assert.equal(o.maxRetries, 1)
  assert.ok(o.signal instanceof AbortSignal)
  assert.equal(o.signal.aborted, false)
  // With less left than one request's timeout, the timeout shrinks to fit.
  assert.equal(claudeRequestOptions(now + 3 * 60_000, now).timeout, 3 * 60_000)
})

test("with too little of the budget left, no call is started at all", () => {
  const now = 1_000_000
  assert.throws(() => claudeRequestOptions(now + CLAUDE_MIN_WINDOW_MS - 1, now), (e) => e instanceof ParseTimeBudgetError)
})

test("makeCallClaude refuses to spend a budget that is already gone — before any network", async () => {
  const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: Date.now() - 1 })
  await assert.rejects(
    () => call({ model: "claude-sonnet-5", pdfBase64: "JVBERi0=", prompt: "p" }),
    (e) => e instanceof ParseTimeBudgetError && isTransientParseError(e),
  )
})

// ─── the task at the door ─────────────────────────────────────────────────────

test("a well-formed task payload passes; anything else is dropped rather than turned into a Firestore path", () => {
  const ok = { homeId: "h1", manualId: "m1", requestId: "r1", mode: "preview" }
  assert.deepEqual(parseTaskPayload(ok), ok)
  for (const bad of [
    null,
    "h1/m1",
    { ...ok, homeId: undefined },
    { ...ok, manualId: "" },
    { ...ok, requestId: 7 },
    { ...ok, mode: "delete-everything" },
    { ...ok, homeId: "h1/../../x" },
  ]) {
    assert.equal(parseTaskPayload(bad), null, JSON.stringify(bad))
  }
})

test("the final attempt is read from Cloud Tasks' retry count", () => {
  assert.equal(PARSE_MAX_ATTEMPTS, 2)
  assert.equal(isFinalAttempt(0), false, "first delivery: a transient failure can wait for the retry")
  assert.equal(isFinalAttempt(1), true, "the retry is the last chance — its failure is written")
  assert.equal(isFinalAttempt(5), true)
  assert.equal(isFinalAttempt(undefined), false, "no header (emulator) = first attempt")
})
