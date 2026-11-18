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
 *     and the unusable-reply retry below.
 * So the worker always gets control back with minutes to spare, writes an
 * honest stage, and decides — as a transient failure — whether to retry.
 *
 * ── The unusable-reply retry (2026-11-17) ────────────────────────────────────
 *
 * A reply can arrive, be billed, and still be unusable: no tool call (only on
 * the unforced Opus route), or tool arguments that are not arrays even after
 * the repair — Sonnet 5 did that in 4 of 22 measured calls on 2026-11-17 (see
 * MalformedExtractionError). The second used to reach runParse's guard as a
 * plain Error, which is permanent: the person saw a failed scan after a paid
 * call and had to tap to scan again, for a fault that is the model's sampling
 * and not the manual (the same PDF comes back clean on other calls).
 *
 * So the reply is read HERE (readExtraction — the same read runParse does),
 * and an unusable one gets ONE more call (MAX_EXTRACTION_CALLS), in this
 * process, inside the same Claude budget. Rules:
 *   - one retry for the whole extraction, whichever fault it was;
 *   - not for malformed arguments cut off at max_tokens (they would be cut
 *     off again), and not when too little of the budget is left for a call;
 *   - each call is logged with its own usage line (`call: 1`, `call: 2`) and
 *     the retry with a warning carrying what arrived, so the rate is countable;
 *   - never a text-JSON fallback: a second unusable reply throws the typed
 *     error and runParse writes the error once.
 * The retry is a second PAID call. It is not charged extra units: a scan is
 * priced at 10 units ≈ $0.55 (shared/quota/policy.ts) against a measured
 * $0.14–0.47 a call, so the price already covers most of it.
 *
 * Because a call can now fail AFTER an answer was paid for (a malformed reply,
 * then a retry that times out), "did callClaude return?" no longer says
 * whether money was spent. Each answer is reported through `onReply` as it
 * arrives, and runParse marks the run billed from that — never refunded —
 * however the call ends. Worst case for one scan: two calls in this attempt
 * and, if the second died on a transient fault, two more in Cloud Tasks' one
 * retry; all under the one charge.
 *
 * ── Prompt cache and usage (2026-09-30) ──────────────────────────────────────
 *
 * `cacheBreakpoint` is config/spend.parseCacheBreakpoint, read by the worker
 * for each attempt (default OFF — buildExtractionRequest says when it pays).
 * Every response — including one without the tool call, which is billed too —
 * is logged with its token and cache numbers (lib/claudeUsage.ts) before it is
 * read, so a week of logs with the switch on says whether it earns its keep.
 */
import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk"
import {
  buildExtractionRequest,
  extractionContent,
  EXTRACTION_TOOL,
  isRetryableExtractionReply,
  MAX_EXTRACTION_CALLS,
  readExtraction,
} from "../../../../shared/parse/parsePrompt.js"
import { logClaudeUsage } from "../lib/claudeUsage.js"
import { ParseTimeBudgetError } from "./errorClass.js"
import { PARSE_ATTEMPT_DEADLINE_SECONDS } from "./parseState.js"
import type { CallClaude } from "./parseTypes.js"

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

export interface CallClaudeOptions {
  /** When this attempt's Claude budget ends (epoch ms). Default: CLAUDE_BUDGET_MS from now. */
  deadlineAt?: number
  /** Put a prompt-cache breakpoint on the PDF (config/spend.parseCacheBreakpoint). Default off. */
  cacheBreakpoint?: boolean
  /** Context for the usage log line: the manual, the run, the Cloud Tasks attempt. */
  logFields?: Record<string, unknown>
  /** TESTS ONLY — the SDK's HTTP transport, so a test can see the exact body
   *  sent without a network. Production never passes it. */
  fetch?: ClientOptions["fetch"]
}

/** Build the real CallClaude bound to an API key and one attempt's budget. */
export function makeCallClaude(apiKey: string, opts: CallClaudeOptions = {}): CallClaude {
  const client = new Anthropic({ apiKey, maxRetries: CLAUDE_SDK_MAX_RETRIES, ...(opts.fetch ? { fetch: opts.fetch } : {}) })
  const deadlineAt = opts.deadlineAt ?? Date.now() + CLAUDE_BUDGET_MS
  const cacheBreakpoint = opts.cacheBreakpoint === true
  return async ({ model, pdfBase64, prompt, onReply }) => {
    const req = buildExtractionRequest(model, pdfBase64, prompt, { cacheBreakpoint })
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
      logClaudeUsage("parseWorker", model, res, { ...opts.logFields, cacheBreakpoint, call: attempt })
      // An answer arrived and is paid for, whatever happens to it next.
      if (res.stop_reason !== "refusal") onReply?.()
      try {
        // The SDK's content blocks are the shape extractParsedResult expects.
        const { content } = extractionContent(
          res as { stop_reason?: string | null; content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> },
          req.toolCallUnforced,
        )
        // Read it now, while a retry is still possible. The arguments go back
        // already repaired, so runParse's own read neither repairs nor logs
        // the repair a second time.
        const extraction = readExtraction({ content })
        return {
          content: content.map((b) => (b.type === "tool_use" && b.name === EXTRACTION_TOOL.name ? { ...b, input: extraction } : b)),
        }
      } catch (e) {
        const budgetLeft = deadlineAt - Date.now() >= CLAUDE_MIN_WINDOW_MS
        if (attempt < MAX_EXTRACTION_CALLS && budgetLeft && isRetryableExtractionReply(e, res.stop_reason)) {
          console.warn(
            `[parse] ${model} sent an unusable extraction reply on call ${attempt} of ${MAX_EXTRACTION_CALLS} ` +
              `(${e instanceof Error ? e.message : String(e)}); calling once more`,
            { ...opts.logFields, call: attempt, error: e instanceof Error ? e.name : "unknown" },
          )
          continue
        }
        throw e
      }
    }
  }
}
