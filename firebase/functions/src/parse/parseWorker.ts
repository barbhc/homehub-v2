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
import type { ParseMode } from "./parseTypes.js"

const REGION = "us-central1"
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")

const MODES: ParseMode[] = ["commit", "preview", "fill_gaps"]

export interface ParseTaskPayload {
  homeId: string
  manualId: string
  requestId: string
  mode: ParseMode
}

/**
 * The task body, checked at the door. It is written by our own enqueue calls,
 * but it arrives over HTTP as JSON like any other input, and a malformed one
 * must end the task rather than become a Firestore path with "undefined" in it.
 */
export function parseTaskPayload(raw: unknown): ParseTaskPayload | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("/")
  if (!id(r.homeId) || !id(r.manualId) || !id(r.requestId)) return null
  if (!MODES.includes(r.mode as ParseMode)) return null
  return { homeId: r.homeId as string, manualId: r.manualId as string, requestId: r.requestId as string, mode: r.mode as ParseMode }
}

/** Is this the last delivery Cloud Tasks will make? `retryCount` counts every
 *  earlier attempt, including ones that never reached the handler. Absent
 *  (the emulator) → treated as the first attempt. */
export function isFinalAttempt(retryCount: number | undefined): boolean {
  return (retryCount ?? 0) + 1 >= PARSE_MAX_ATTEMPTS
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
      console.error("[parseWorker] malformed task payload; dropping it", { data: req.data, id: req.id })
      return
    }
    const outcome = await runParse(
      getFirestore(),
      {
        callClaude: makeCallClaude(ANTHROPIC_API_KEY.value(), { deadlineAt: startedAt + CLAUDE_BUDGET_MS }),
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
