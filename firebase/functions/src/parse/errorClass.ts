/**
 * Which parse failures are worth a second attempt.
 *
 * parseWorker used to rethrow EVERY error, so Cloud Tasks retried a 400 "this
 * PDF is not valid" exactly like a 529 "overloaded" — paying for a second
 * Claude call that could only fail the same way, and (because the retry
 * re-claims the run) flipping an error the user had already been shown back
 * to "Reading the manual". Now the worker retries only what is transient
 * (network, 5xx/529/429/408/409, timeouts), and a permanent failure is written
 * once and left alone.
 *
 * Typed checks, not message matching (claude-api skill: catch a chain, not
 * one broad class): the Anthropic SDK's error classes, Firestore's gRPC codes,
 * Cloud Storage's HTTP codes, and our own two classes below.
 */
import Anthropic from "@anthropic-ai/sdk"

/** HTTP statuses a retry can fix: timeout, conflict, rate limit, server-side. */
const TRANSIENT_HTTP = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529])

/** gRPC codes (Firestore): DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, ABORTED,
 *  INTERNAL, UNAVAILABLE. */
const TRANSIENT_GRPC = new Set([4, 8, 10, 13, 14])

/** Node / undici network error codes. */
const TRANSIENT_NET = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
])

/** Error `type`s the API sends in a mid-stream error event (no HTTP status). */
const TRANSIENT_STREAM_TYPES = new Set(["overloaded_error", "api_error", "rate_limit_error", "timeout_error"])

/** The worker ran out of its time budget before (or during) the Claude call. */
export class ParseTimeBudgetError extends Error {
  constructor(message = "Ran out of time before the manual could be read.") {
    super(message)
    this.name = "ParseTimeBudgetError"
  }
}

/** A URL manual's download answered with a non-2xx status. The message is the
 *  user-facing sentence; `status` is what decides whether to try again. */
export class PdfFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "PdfFetchError"
  }
}

export function isTransientParseError(err: unknown): boolean {
  // Anthropic SDK — most specific first. Our own abort signal is the time
  // budget firing, which is a timeout.
  if (err instanceof Anthropic.APIUserAbortError) return true
  if (err instanceof Anthropic.APIConnectionError) return true // includes APIConnectionTimeoutError
  if (err instanceof Anthropic.APIError) {
    if (typeof err.status === "number") return TRANSIENT_HTTP.has(err.status)
    // A mid-stream error event carries its type in the body, not a status.
    const type = (err.error as { error?: { type?: unknown } } | undefined)?.error?.type
    return typeof type === "string" && TRANSIENT_STREAM_TYPES.has(type)
  }
  if (err instanceof ParseTimeBudgetError) return true
  if (err instanceof PdfFetchError) return TRANSIENT_HTTP.has(err.status)
  if (!err || typeof err !== "object") return false

  const e = err as { name?: unknown; code?: unknown; cause?: unknown; message?: unknown }
  // AbortSignal.timeout() on a fetch.
  if (e.name === "TimeoutError" || e.name === "AbortError") return true
  if (typeof e.code === "number") {
    // Cloud Storage's ApiError carries the HTTP status; Firestore, a gRPC code.
    return e.code >= 100 ? TRANSIENT_HTTP.has(e.code) : TRANSIENT_GRPC.has(e.code)
  }
  if (typeof e.code === "string" && TRANSIENT_NET.has(e.code)) return true
  // undici: TypeError("fetch failed") with the socket error as `cause`. The
  // download never completed; nothing was spent at Anthropic; worth a retry.
  if (err instanceof TypeError && typeof e.message === "string" && /fetch failed/i.test(e.message)) return true
  if (e.cause && e.cause !== err) return isTransientParseError(e.cause)
  return false
}
