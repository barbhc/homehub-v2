/**
 * Per-model request rules for every Claude call in the app (parse worker, the
 * ai/* functions, and the eval harnesses). Dependency-free so the functions
 * package, the app, and the vite-node eval scripts can all import it.
 *
 * Why this exists (2026-09 model migration): the current models reject request
 * shapes the older ones accepted, and each rejection is an HTTP 400 that a
 * green build never sees.
 *  - Claude Opus 5.5 rejects forced `tool_choice` ({type:"tool"|"any"}) and
 *    `thinking: {type:"disabled"}`. Thinking is always on; `output_config.effort`
 *    is the control, and thinking tokens count toward `max_tokens`.
 *  - Claude Sonnet 5 runs adaptive thinking when `thinking` is omitted (Sonnet
 *    4.6 ran thinking-off). Our Sonnet TEXT routes (chat, JSON-in-text) are
 *    short calls with tight `max_tokens`, so they disable it explicitly to keep
 *    the old cost, latency, and output budget.
 *  - Sonnet 5 FORCED-TOOL routes must NOT send `thinking: {type:"disabled"}`.
 *    Measured 2026-09-23 on the manual-extraction call: with thinking disabled,
 *    Sonnet 5 returned the `chunks` array as a JSON-encoded STRING in 4 of 16
 *    runs (the worker then fails "chunks/tasks not arrays"); with `thinking`
 *    omitted it was a real array 14 of 14, with no thinking blocks and the same
 *    output tokens (a forced tool call doesn't think). So forced-tool callers
 *    skip thinkingParamsFor.
 */

/** Current model IDs. Exact IDs, no date suffixes. */
export const MODEL_OPUS = "claude-opus-5-5"
export const MODEL_SONNET = "claude-sonnet-5"
export const MODEL_HAIKU = "claude-haiku-4-5"

/** Beta that enables server-side refusal fallbacks (`fallbacks: "default"`). */
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01"

/**
 * Models that return 400 on forced tool use (`tool_choice` type "tool"/"any").
 * Routes on these models get JSON via structured outputs instead.
 */
export function rejectsForcedToolChoice(model: string): boolean {
  return /^claude-(opus-5-5|fable-5-1|mythos-5-1)\b/.test(model)
}

/**
 * Thinking params that keep a short TEXT route behaving as it did before the
 * migration. Sonnet 5 would otherwise think by default and spend the route's
 * small `max_tokens` on it. Opus 5.5 gets nothing here (disabling is a 400);
 * its routes set `output_config.effort` themselves. Not for forced-tool calls
 * (see the header: disabling thinking there makes Sonnet 5 stringify arrays).
 */
export function thinkingParamsFor(model: string): { thinking?: { type: "disabled" } } {
  return /^claude-sonnet-5\b/.test(model) ? { thinking: { type: "disabled" } } : {}
}

/**
 * Throw a readable error when Claude declined the request. A refusal arrives
 * as HTTP 200 with `stop_reason: "refusal"`; reading its content as if it were
 * an answer turns a decline into silent empty data.
 */
export function assertNotRefused(res: { stop_reason?: string | null }): void {
  if (res.stop_reason === "refusal") {
    throw new Error("The AI declined to answer this request. Try rephrasing it, or try again later.")
  }
}
