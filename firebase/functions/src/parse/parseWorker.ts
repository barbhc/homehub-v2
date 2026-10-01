/**
 * parseWorker — the Cloud Tasks worker (2nd gen, timeoutSeconds 1800). This is
 * the reason for the whole migration: Supabase edge isolates hard-kill at 150s
 * while real parses take 144–241s; a 1800s worker removes the ceiling. The
 * handler is a thin wrapper — all logic lives in the testable `runParse` core.
 *
 * retryConfig.maxAttempts: 2 — one retry, for TRANSIENT failures only
 * (C2, 2026-09-30). This handler used to rethrow every error, so Cloud Tasks
 * retried a 400 "invalid PDF" like a 529 "overloaded": a second paid Claude call
 * that could only fail the same way, and a retry that re-claimed the run and
 * flipped the error the user had just been shown back to "Reading the manual".
 * Now runParse decides (errorClass.ts): a transient failure with an attempt
 * left comes back as `retry` and is rethrown here; everything else — done,
 * error, superseded — returns normally and the task is finished.
 */
import { onTaskDispatched } from "firebase-functions/v2/tasks"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { runParse } from "./runParse.js"
import { CLAUDE_BUDGET_MS, makeCallClaude } from "./anthropic.js"
import { makeFetchPdf } from "./storagePdf.js"
import { PARSE_ATTEMPT_DEADLINE_SECONDS, PARSE_MAX_ATTEMPTS } from "./parseState.js"
import { readSpendConfig, type SpendConfig } from "../lib/quota.js"
import { z } from "zod"
import { checkInput, DocId, logInvalidInput } from "../lib/validate.js"
import type { ParseMode } from "./parseTypes.js"

const REGION = "us-central1"
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")

const MODES = ["commit", "preview", "fill_gaps"] as const satisfies readonly ParseMode[]

/** The task body. Unlike enqueueParse, the mode here is required and exact:
 *  only our own enqueue writes it, so anything else is not ours to guess at. */
export const ParseTaskPayloadSchema = z.object({
  homeId: DocId,
  manualId: DocId,
  requestId: DocId,
  mode: z.enum(MODES),
})
export type ParseTaskPayload = z.output<typeof ParseTaskPayloadSchema>

/**
 * The task body, checked at the door. It is written by our own enqueue calls,
 * but it arrives over HTTP as JSON like any other input, and a malformed one
 * must end the task rather than become a Firestore path with "undefined" in it.
 * Null (logged: the issue paths, not the body) → the handler drops the task.
 */
export function parseTaskPayload(raw: unknown): ParseTaskPayload | null {
  const checked = checkInput(ParseTaskPayloadSchema, raw)
  if (checked.ok) return checked.data
  logInvalidInput("parseWorker", checked.issues)
  return null
}

/** Is this the last delivery Cloud Tasks will make? `retryCount` counts every
 *  earlier attempt, including ones that never reached the handler. Absent
 *  (the emulator) → treated as the first attempt. */
export function isFinalAttempt(retryCount: number | undefined): boolean {
  return (retryCount ?? 0) + 1 >= PARSE_MAX_ATTEMPTS
}

/**
 * config/spend.parseCacheBreakpoint for this attempt: prompt-cache the manual
 * PDF in the extraction request (buildExtractionRequest says when that pays).
 * Read per attempt, so the owner can turn it on or off without a deploy.
 *
 * A failed read is logged and means OFF — the request every parse sent before
 * the switch existed. It must not fail the parse: the switch only chooses
 * between two request shapes, and a Firestore hiccup here would otherwise stop
 * a scan that has everything else it needs (and the run's own reads, a moment
 * later, report any real outage through runParse's usual error path).
 */
export async function parseCacheBreakpointFor(read: () => Promise<SpendConfig>): Promise<boolean> {
  try {
    return (await read()).parseCacheBreakpoint
  } catch (e) {
    console.error("[parseWorker] could not read config/spend.parseCacheBreakpoint; sending the request without the cache breakpoint:", e)
    return false
  }
}

export const parseWorker = onTaskDispatched(
  {
    region: REGION,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: PARSE_ATTEMPT_DEADLINE_SECONDS,
    memory: "1GiB",
    retryConfig: { maxAttempts: PARSE_MAX_ATTEMPTS, minBackoffSeconds: 10 },
    rateLimits: { maxConcurrentDispatches: 2 },
  },
  async (req) => {
    // The Claude budget is counted from the moment this attempt starts, so the
    // download and the call share it and the commit always has time left.
    const startedAt = Date.now()
    const payload = parseTaskPayload(req.data)
    if (!payload) {
      // Returned, not thrown: a retry cannot fix a malformed body, and Cloud
      // Tasks retries anything that throws. The issue paths are logged above.
      console.error("[parseWorker] malformed task payload; dropping it", { id: req.id })
      return
    }
    const db = getFirestore()
    const cacheBreakpoint = await parseCacheBreakpointFor(() => readSpendConfig(db))
    const outcome = await runParse(
      db,
      {
        callClaude: makeCallClaude(ANTHROPIC_API_KEY.value(), {
          deadlineAt: startedAt + CLAUDE_BUDGET_MS,
          cacheBreakpoint,
          // On the usage log line, so a retry's cache read can be matched to
          // the attempt that wrote the entry.
          logFields: {
            homeId: payload.homeId,
            manualId: payload.manualId,
            requestId: payload.requestId,
            mode: payload.mode,
            taskAttempt: (req.retryCount ?? 0) + 1,
          },
        }),
        fetchPdf: makeFetchPdf(),
      },
      { ...payload, finalAttempt: isFinalAttempt(req.retryCount) },
    )
    if (outcome.retry) {
      // The only case Cloud Tasks should retry. runParse has already parked
      // the run at `queued`, so the user sees it waiting, not failed.
      throw new Error(`parse ${payload.manualId} hit a transient failure; retrying: ${outcome.error}`)
    }
  },
)
