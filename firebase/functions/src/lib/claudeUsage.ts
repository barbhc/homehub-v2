/**
 * One structured log line per Claude call: what it cost in tokens, and how
 * much of the prompt was written to or read from the prompt cache.
 *
 * Prompt caching (2026-09-30) can save money or cost it: a cache write bills
 * 1.25× the input price, a read 0.1× (0.05× on Opus 5.5), and nothing in the
 * app's own accounting — the unit quota — can tell which is happening. These
 * lines can. A week of them answers "is caching paying?" per call site:
 *
 *   net saving, in input-token equivalents
 *     = 0.9 × Σ cache_read_input_tokens − 0.25 × Σ cache_creation_input_tokens
 *   (0.95 × reads on Opus 5.5). Positive → keep; negative → drop.
 *
 * `input_tokens` is only the UNCACHED remainder of the prompt; `promptTokens`
 * adds the three back together. The Cloud Logging query and the jq that sums
 * a week of lines are in docs/rollback.md §3 ("The prompt cache").
 *
 * Logged with firebase-functions' logger, so each field lands in
 * `jsonPayload` and the message is `jsonPayload.message="claude usage"`.
 */
import * as logger from "firebase-functions/logger"

/** Every function that calls Claude, named as its aiSpendGlobal `fns.*` key is. */
export type ClaudeCallSite =
  | "parseWorker"
  | "chatQuery"
  | "detectDocType"
  | "ingestReference"
  | "generateTasks"
  | "ocr"
  | "suggestCareNotes"
  | "importCareUrl"
  | "productLookup"
  | "proposeReminders"
  | "discussTask"
  | "classifyExistingTasks"

export const CLAUDE_USAGE_MESSAGE = "claude usage"

/** The response fields the line reads — the SDK's Message and BetaMessage both fit. */
export interface ClaudeResponseLike {
  model?: string | null
  stop_reason?: string | null
  usage?: {
    input_tokens?: number | null
    output_tokens?: number | null
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  } | null
}

export interface ClaudeUsageLine {
  callSite: ClaudeCallSite
  /** The model the request named. */
  model: string
  /** The model that answered (a server-side fallback can differ). */
  servedModel: string | null
  stopReason: string | null
  /** Billed at the full input price: the prompt after the last cache hit. */
  input_tokens: number
  /** Written to the cache on this call: billed at 1.25×. */
  cache_creation_input_tokens: number
  /** Read from the cache on this call: billed at 0.1× (0.05× on Opus 5.5). */
  cache_read_input_tokens: number
  output_tokens: number
  /** The whole prompt, however it was billed: the three input fields summed. */
  promptTokens: number
}

const tokens = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0)

/** The line for one response. `extra` is context (a PDF count, the flag that
 *  shaped the request); it can add fields but never overwrite the numbers. */
export function claudeUsageLine(
  callSite: ClaudeCallSite,
  model: string,
  res: ClaudeResponseLike,
  extra: Record<string, unknown> = {},
): ClaudeUsageLine & Record<string, unknown> {
  const u = res.usage ?? {}
  const input = tokens(u.input_tokens)
  const written = tokens(u.cache_creation_input_tokens)
  const read = tokens(u.cache_read_input_tokens)
  return {
    ...extra,
    callSite,
    model,
    servedModel: res.model ?? null,
    stopReason: res.stop_reason ?? null,
    input_tokens: input,
    cache_creation_input_tokens: written,
    cache_read_input_tokens: read,
    output_tokens: tokens(u.output_tokens),
    promptTokens: input + written + read,
  }
}

/** Log it. Call this for every response Claude returned — a refusal or a reply
 *  without the expected tool call was billed too — and before reading it. */
export function logClaudeUsage(
  callSite: ClaudeCallSite,
  model: string,
  res: ClaudeResponseLike,
  extra?: Record<string, unknown>,
): void {
  logger.info(CLAUDE_USAGE_MESSAGE, claudeUsageLine(callSite, model, res, extra))
}
