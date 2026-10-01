/**
 * enqueueParse — the callable clients invoke to (re)parse a manual. It claims a
 * fresh requestId on the manual (parse.stage = "queued"), caps in-flight parses
 * per home, then enqueues a Cloud Task for the long-running worker. Returns
 * immediately with the requestId; the client watches parse.stage via onSnapshot.
 *
 * ── Check before charging (C1, 2026-09-30) ──────────────────────────────────
 *
 * It used to charge 10 units FIRST, check only the home-wide in-flight count,
 * overwrite the manual's requestId, and enqueue without a task id. So the item
 * page re-enqueueing the manual the add wizard had just started cost a second
 * 10 units and a second Claude call, and the two runs raced on one manual.
 *
 * Now, in order, before any charge:
 *   1. THIS manual: a scan that is live (active stage, last write younger than
 *      STALE_PARSE_MS) is refused — `failed-precondition`, a calm sentence, and
 *      details naming the live run so the client can follow it instead of
 *      reporting a failure. An active stage OLDER than that is a dead worker:
 *      it is superseded (logged, and its charge refunded if it never reached
 *      Claude), so a stuck manual can always be scanned again.
 *   2. The home: at most MAX_IN_FLIGHT live scans (stalled ones don't count).
 * Then the charge, then a TRANSACTION that re-checks step 1 and writes the new
 * run + its ledger entry together — two enqueues racing for one manual cannot
 * both win; the loser's charge goes straight back and it is told to follow the
 * winner. The task is enqueued with id = requestId, so one run can never be
 * queued twice.
 */
import { randomUUID } from "node:crypto"
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { getFunctions } from "firebase-admin/functions"
import { z } from "zod"
import type { ParseMode } from "./parseTypes.js"
import { DocId, parseCallableInput } from "../lib/validate.js"
import { chargeAiQuota, isQuotaExhausted, type QuotaHold } from "../lib/quota.js"
import { recordParseCharge, refundParseCharge } from "../lib/parseCharges.js"
import { PARSE_ERR } from "../../../../shared/parse/parseErrors.js"
import { ACTIVE_STAGES, PARSE_ATTEMPT_DEADLINE_SECONDS, runLiveness } from "./parseState.js"
import type { ParseTaskPayload } from "./parseWorker.js"

const REGION = "us-central1"
/** Per-home cap on simultaneously in-flight parses (queue drains a bulk rescan
 *  serially via the worker's maxConcurrentDispatches; this stops runaway fan-out
 *  at enqueue time). */
export const MAX_IN_FLIGHT = 5

export interface EnqueueDeps {
  /** Charge the caller for one scan (chargeAiQuota in production). */
  charge(uid: string): Promise<QuotaHold>
  /** Hand the run to the worker queue under `taskId` (dedupes). */
  enqueue(payload: ParseTaskPayload, taskId: string): Promise<void>
}

export interface EnqueueInput {
  uid: string
  homeId: string
  manualId: string
  mode: ParseMode
}

/** The refusal that tells the client a scan of this manual is running now. */
function inFlight(run: { requestId: string | null; mode: string | null; stage: string }): HttpsError {
  return new HttpsError("failed-precondition", PARSE_ERR.alreadyReading, {
    kind: "parse_in_flight",
    requestId: run.requestId,
    mode: run.mode,
    stage: run.stage,
  })
}

export async function runEnqueueParse(db: Firestore, deps: EnqueueDeps, input: EnqueueInput): Promise<{ ok: true; requestId: string }> {
  const { uid, homeId, manualId, mode } = input

  // Membership check (Admin SDK bypasses rules — enforce here).
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home.")

  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)
  const manual = await manualRef.get()
  if (!manual.exists) throw new HttpsError("not-found", "Manual not found.")

  // ── 1. This manual, before any charge ─────────────────────────────────────
  const before = runLiveness(manual.get("parse"), Date.now())
  if (before.state === "live") throw inFlight(before)

  // ── 2. The home's in-flight cap, stalled runs excluded ────────────────────
  const active = await db
    .collection(`homes/${homeId}/manuals`)
    .where("parse.stage", "in", ACTIVE_STAGES)
    .select("parse.stage", "parse.stageAt")
    .get()
  const nowMs = Date.now()
  const live = active.docs.filter((d) => runLiveness(d.get("parse"), nowMs).state === "live").length
  if (live >= MAX_IN_FLIGHT) {
    // Refused before anything was charged, queued or parsed.
    throw new HttpsError("resource-exhausted", "Too many parses in progress; try again shortly.")
  }

  // ── 3. Charge ──────────────────────────────────────────────────────────────
  // The parse worker is the most expensive Claude call in the app — charge the
  // enqueuing user's daily quota here (the worker itself has no caller context).
  //
  // HH-124: a ceiling is not a failure. When the charge is refused for capacity
  // (rather than for going too fast), the manual is parked as `awaiting_capacity`
  // so `retryAwaitingCapacity` can start it when capacity frees. The error is
  // still thrown — the user should hear about it immediately — but it now means
  // "queued" rather than "gone".
  //
  // Only quota refusals park. A rate limit means "wait nine seconds", and
  // parking those would fill the queue with work the user is about to redo by
  // hand; they are re-thrown untouched.
  let hold: QuotaHold
  try {
    hold = await deps.charge(uid)
  } catch (err) {
    if (isQuotaExhausted(err)) {
      await manualRef.set(
        {
          parse: {
            stage: "awaiting_capacity",
            stageAt: Timestamp.now(),
            requestId: randomUUID(),
            mode,
            model: null,
            attempt: 0,
            error: null,
            summary: null,
            awaiting: { uid, since: Timestamp.now() },
          },
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      )
    }
    throw err
  }

  // ── 4. Claim the manual for the new run, atomically ────────────────────────
  const requestId = randomUUID()
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(manualRef)
    if (!snap.exists) return { kind: "gone" as const }
    const now = runLiveness(snap.get("parse"), Date.now())
    // Someone started a scan between step 1 and here — follow theirs.
    if (now.state === "live") return { kind: "taken" as const, run: now }
    const at = Timestamp.now()
    tx.set(
      manualRef,
      {
        parse: {
          stage: "queued",
          stageAt: at,
          requestId,
          mode,
          model: null,
          attempt: 0,
          error: null,
          summary: null,
          retry: null,
          awaiting: null,
        },
        updatedAt: at,
      },
      { merge: true },
    )
    if (hold.record) recordParseCharge(tx, db, requestId, hold.record, { homeId, manualId })
    return { kind: "claimed" as const, superseded: now.state === "stalled" ? now : null }
  })

  if (claim.kind === "gone") {
    await hold.refund()
    throw new HttpsError("not-found", "Manual not found.")
  }
  if (claim.kind === "taken") {
    await hold.refund()
    throw inFlight(claim.run)
  }
  if (claim.superseded) {
    const s = claim.superseded
    console.warn("[enqueueParse] superseding a stalled scan", {
      homeId,
      manualId,
      staleRequestId: s.requestId,
      stage: s.stage,
      ageMinutes: s.ageMs === null ? null : Math.round(s.ageMs / 60_000),
    })
    // A dead run that never reached Claude cost the user for nothing. The
    // ledger knows: `held` means the Claude call was never started (the worker
    // moves it to `vendor` first), whatever stage the manual shows.
    if (s.requestId) {
      await refundParseCharge(db, s.requestId, { from: ["held"], reason: "stalled; superseded by a new scan" })
    }
  }

  // ── 5. Hand it to the worker ────────────────────────────────────────────────
  try {
    await deps.enqueue({ homeId, manualId, requestId, mode }, requestId)
  } catch (err) {
    const code = (err as { code?: unknown })?.code
    if (code === "functions/task-already-exists") return { ok: true, requestId } // it IS queued
    console.error(`[enqueueParse] could not enqueue ${homeId}/${manualId} (${requestId}):`, err)
    // Nothing will ever read this manual: give the charge back and say so,
    // instead of leaving it "queued" until the stalled-parse sweep notices.
    await refundParseCharge(db, requestId, { from: ["held"], reason: "enqueue failed" })
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(manualRef)
      if (snap.get("parse.requestId") !== requestId || snap.get("parse.stage") !== "queued") return
      const at = Timestamp.now()
      tx.set(
        manualRef,
        {
          parse: { stage: "error", stageAt: at, requestId, error: { message: PARSE_ERR.notStarted, raw: String(err).slice(0, 500), stage: "queued", at } },
          updatedAt: at,
        },
        { merge: true },
      )
    })
    throw new HttpsError("unavailable", PARSE_ERR.notStarted)
  }

  return { ok: true, requestId }
}

export const PARSE_MODES = ["commit", "preview", "fill_gaps"] as const satisfies readonly ParseMode[]

/**
 * The request (H3a). `mode` is parsed on its own below: a missing or
 * unrecognised mode is not refused but made "preview" — see there.
 */
export const EnqueueParseRequest = z.object({ homeId: DocId, manualId: DocId, mode: z.unknown() })

/**
 * FAIL SAFE, not fail destructive. This defaulted to "commit", so a request
 * that omitted or misspelled the mode wrote tasks straight into someone's
 * home. "preview" only writes a draft the user must accept, so the worst a
 * malformed or stale request can do is prepare something and wait.
 */
export function parseModeOrPreview(raw: unknown): { mode: ParseMode; recognised: boolean } {
  const parsed = z.enum(PARSE_MODES).safeParse(raw)
  return parsed.success ? { mode: parsed.data, recognised: true } : { mode: "preview", recognised: raw === undefined }
}

export const enqueueParse = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")

  const input = parseCallableInput("enqueueParse", EnqueueParseRequest, request.data, "homeId and manualId are required.")
  const { homeId, manualId } = input
  const { mode, recognised } = parseModeOrPreview(input.mode)
  if (!recognised) {
    // The ids, never the value the client sent.
    console.warn("[enqueueParse] unrecognised mode, defaulting to preview", { homeId, manualId })
  }

  const db = getFirestore()
  return runEnqueueParse(
    db,
    {
      charge: (payer) => chargeAiQuota(db, payer, "enqueueParse"),
      enqueue: async (payload, taskId) => {
        await getFunctions()
          .taskQueue(`locations/${REGION}/functions/parseWorker`)
          .enqueue(payload, { dispatchDeadlineSeconds: PARSE_ATTEMPT_DEADLINE_SECONDS, id: taskId })
      },
    },
    { uid, homeId, manualId, mode },
  )
})
