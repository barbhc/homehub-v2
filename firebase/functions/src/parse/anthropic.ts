/**
 * Production Claude extraction call. The request comes from
 * buildExtractionRequest(model): forced EXTRACTION_TOOL + samplingParamsFor
 * (invariants 2 & 3) on Sonnet/Haiku; on Opus 5.5, which rejects forced
 * tool_choice, the same tool under tool_choice "auto" with a check that the
 * call happened (see buildExtractionRequest for why not structured outputs).
 * The PDF is sent as a base64 document block. Injected into the worker as a
 * `CallClaude` so the worker core is unit-testable with a fixture response.
 *
 * ── Time (C2, 2026-09-30) ────────────────────────────────────────────────────
 *
 * Only the TRANSPORT is bounded here; the request body is exactly what
 * buildExtractionRequest builds (the parse eval measures the same request).
 *
 * The SDK defaults — 2 retries × a 600 s timeout — could spend the whole
 * 1,800 s Cloud Tasks attempt on one call, and a streamed (Opus) reply is not
 * covered by that timeout at all: it bounds only the wait for headers. Cloud
 * Tasks then killed the worker mid-call, the stage stayed at claude_call, and
 * the retry — which passed the claim check — paid for a second call. Now every
 * request carries:
 *   - the SDK's per-request timeout (10 min) with ONE SDK retry, and
 *   - an AbortSignal for whatever is left of the attempt's Claude budget
 *     (CLAUDE_BUDGET_MS from the worker's start), which also bounds streaming
 *     and the unforced-tool retry below.
 * So the worker always gets control back with minutes to spare, writes an
 * honest stage, and decides — as a transient failure — whether to retry.
 */
import Anthropic from "@anthropic-ai/sdk"
import { buildExtractionRequest, extractionContent, NoToolCallError } from "../../../../shared/parse/parsePrompt.js"
import { ParseTimeBudgetError } from "./errorClass.js"
import { PARSE_ATTEMPT_DEADLINE_SECONDS } from "./parseState.js"
import type { CallClaude } from "./parseTypes.js"

/** Unforced tool calls get one retry when the model answers without the tool. */
const MAX_ATTEMPTS_UNFORCED = 2

/** Everything Claude may take within one worker attempt, counted from the
 *  attempt's start (the PDF download comes out of it too). The last five
 *  minutes of the attempt are kept for the stage writes and the commit. */
export const CLAUDE_BUDGET_MS = (PARSE_ATTEMPT_DEADLINE_SECONDS - 5 * 60) * 1000

/** One HTTP request — the SDK's own default, which is what it allows a
 *  21k-token non-streaming Sonnet reply. */
export const CLAUDE_REQUEST_TIMEOUT_MS = 10 * 60_000

/** SDK retries per request (the SDK default is 2; see the header). */
export const CLAUDE_SDK_MAX_RETRIES = 1

/** Less than this left and a request is not started: it could only be cut
 *  off, and a cut-off call can still be billed. */
export const CLAUDE_MIN_WINDOW_MS = 2 * 60_000

/**
 * The transport options for one Claude request made at `nowMs` under an
 * attempt whose Claude budget ends at `deadlineAt`. Throws
 * ParseTimeBudgetError (transient: the next attempt starts a fresh budget)
 * when too little is left to be worth starting.
 */
export function claudeRequestOptions(
  deadlineAt: number,
  nowMs: number = Date.now(),
): { signal: AbortSignal; timeout: number; maxRetries: number } {
  const remaining = deadlineAt - nowMs
  if (remaining < CLAUDE_MIN_WINDOW_MS) {
    throw new ParseTimeBudgetError(
      `Only ${Math.max(0, Math.round(remaining / 1000))}s of this attempt's Claude budget left — not starting a call.`,
    )
  }
  return {
    signal: AbortSignal.timeout(remaining),
    timeout: Math.min(CLAUDE_REQUEST_TIMEOUT_MS, remaining),
    maxRetries: CLAUDE_SDK_MAX_RETRIES,
  }
}

/** Build the real CallClaude bound to an API key and one attempt's budget. */
export function makeCallClaude(apiKey: string, opts: { deadlineAt?: number } = {}): CallClaude {
  const client = new Anthropic({ apiKey, maxRetries: CLAUDE_SDK_MAX_RETRIES })
  const deadlineAt = opts.deadlineAt ?? Date.now() + CLAUDE_BUDGET_MS
  return async ({ model, pdfBase64, prompt }) => {
    const req = buildExtractionRequest(model, pdfBase64, prompt)
    const attempts = req.toolCallUnforced ? MAX_ATTEMPTS_UNFORCED : 1
    for (let attempt = 1; ; attempt++) {
      const options = claudeRequestOptions(deadlineAt)
      // Outgoing request body built by the shared builder; the SDK version
      // pinned here predates the `fallbacks` field, hence the assertions.
      const res = req.betas.length
        ? req.stream
          ? await client.beta.messages
              .stream({ ...req.params, betas: req.betas } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming, options)
              .finalMessage()
          : await client.beta.messages.create(
              { ...req.params, betas: req.betas } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming,
              options,
            )
        : req.stream
          ? await client.messages.stream(req.params as unknown as Anthropic.MessageCreateParamsNonStreaming, options).finalMessage()
          : await client.messages.create(req.params as unknown as Anthropic.MessageCreateParamsNonStreaming, options)
      try {
        // The SDK's content blocks are the shape extractParsedResult expects.
        return extractionContent(
          res as { stop_reason?: string | null; content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> },
          req.toolCallUnforced,
        )
      } catch (e) {
        if (e instanceof NoToolCallError && attempt < attempts) {
          console.warn(`[parse] ${model} answered without the extraction tool (attempt ${attempt}); retrying`)
          continue
        }
        throw e
      }
    }
  }
}
