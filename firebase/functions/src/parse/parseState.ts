/**
 * The parse run's timing and liveness rules, in one place — the enqueue
 * check, the worker, and the stalled-parse sweep must agree on them, or one
 * of them refuses what another lets through.
 */
import type { ParseStage } from "./parseTypes.js"

/** Stages during which a worker owns the manual. `awaiting_capacity` is NOT
 *  one: nothing is running, so it must not hold an in-flight slot. */
export const ACTIVE_STAGES: readonly ParseStage[] = [
  "queued",
  "started",
  "pdf_fetched",
  "claude_call",
  "claude_responded",
  "committing",
]

export function isActiveStage(stage: unknown): stage is ParseStage {
  return typeof stage === "string" && (ACTIVE_STAGES as readonly string[]).includes(stage)
}

/**
 * Cloud Tasks gives one worker attempt this long (parseWorker `timeoutSeconds`
 * and every enqueue's `dispatchDeadlineSeconds` — 30 minutes is the Cloud
 * Tasks maximum). One constant so the three can never disagree.
 */
export const PARSE_ATTEMPT_DEADLINE_SECONDS = 1800

/** Cloud Tasks attempts per run: the first plus one retry, for transient
 *  failures only (parseWorker rethrows nothing else). */
export const PARSE_MAX_ATTEMPTS = 2

/**
 * An active stage whose last write is older than this is DEAD, not busy.
 *
 * Every stage write stamps `stageAt` with the time of the write, and a live
 * attempt writes at least once per phase; the longest phase — the Claude call —
 * is bounded well inside the 30-minute attempt (anthropic.ts:
 * CLAUDE_BUDGET_MS). So 35 minutes without a write means the attempt was
 * killed and nothing is coming: the enqueue check lets a new scan replace it
 * (instead of refusing the manual forever as "already being read"), and the
 * sweep turns it into an error the page can show, freeing the home's
 * in-flight slot.
 */
export const STALE_PARSE_MS = 35 * 60_000

/** How old the manual's current stage write is, in ms (null = no usable
 *  stageAt, which counts as old — an active stage with no time is not
 *  evidence of a live worker). */
export function stageAgeMs(stageAt: unknown, nowMs: number): number | null {
  const ms =
    stageAt && typeof (stageAt as { toMillis?: unknown }).toMillis === "function"
      ? (stageAt as { toMillis(): number }).toMillis()
      : null
  return ms === null ? null : nowMs - ms
}

export type RunLiveness =
  | { state: "idle" }
  | { state: "live"; requestId: string | null; mode: string | null; stage: ParseStage; ageMs: number }
  | { state: "stalled"; requestId: string | null; mode: string | null; stage: ParseStage; ageMs: number | null }

/** Is a parse of this manual running right now, stalled, or not running? */
export function runLiveness(parse: Record<string, unknown> | undefined, nowMs: number): RunLiveness {
  const stage = parse?.stage
  if (!isActiveStage(stage)) return { state: "idle" }
  const requestId = typeof parse?.requestId === "string" ? parse.requestId : null
  const mode = typeof parse?.mode === "string" ? parse.mode : null
  const ageMs = stageAgeMs(parse?.stageAt, nowMs)
  if (ageMs === null || ageMs > STALE_PARSE_MS) return { state: "stalled", requestId, mode, stage, ageMs }
  return { state: "live", requestId, mode, stage, ageMs }
}
