/**
 * enqueueParse — the callable clients invoke to (re)parse a manual. It claims a
 * fresh requestId on the manual (parse.stage = "queued"), caps in-flight parses
 * per home, then enqueues a Cloud Task for the long-running worker. Returns
 * immediately with the requestId; the client watches parse.stage via onSnapshot.
 */
import { randomUUID } from "node:crypto"
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { getFunctions } from "firebase-admin/functions"
import type { ParseMode } from "./parseTypes.js"
import { chargeAiQuota, isQuotaExhausted, type QuotaHold } from "../lib/quota.js"

const REGION = "us-central1"
/** Per-home cap on simultaneously in-flight parses (queue drains a bulk rescan
 *  serially via the worker's maxConcurrentDispatches; this stops runaway fan-out
 *  at enqueue time). */
const MAX_IN_FLIGHT = 5
const ACTIVE_STAGES = ["queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"]

export const enqueueParse = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")

  const { homeId, manualId, mode: rawMode } = (request.data ?? {}) as {
    homeId?: string
    manualId?: string
    mode?: ParseMode
  }
  if (!homeId || !manualId) throw new HttpsError("invalid-argument", "homeId and manualId are required.")

  // FAIL SAFE, not fail destructive. This defaulted to "commit", so a request
  // that omitted or misspelled the mode wrote tasks straight into someone's
  // home. "preview" only writes a draft the user must accept, so the worst a
  // malformed or stale request can now do is prepare something and wait.
  const VALID: ParseMode[] = ["commit", "preview", "fill_gaps"]
  const mode: ParseMode = VALID.includes(rawMode as ParseMode) ? (rawMode as ParseMode) : "preview"
  if (rawMode !== undefined && rawMode !== mode) {
    console.warn("[enqueueParse] unrecognised mode, defaulting to preview", { rawMode, homeId, manualId })
  }

  const db = getFirestore()

  // Membership check (Admin SDK bypasses rules — enforce here).
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home.")

  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)
  const manual = await manualRef.get()
  if (!manual.exists) throw new HttpsError("not-found", "Manual not found.")

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
    hold = await chargeAiQuota(db, uid, "enqueueParse")
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
        { merge: true }
      )
    }
    throw err
  }

  // In-flight cap.
  const inFlight = await db
    .collection(`homes/${homeId}/manuals`)
    .where("parse.stage", "in", ACTIVE_STAGES)
    .count()
    .get()
  if (inFlight.data().count >= MAX_IN_FLIGHT) {
    // Rejected before anything was queued, let alone parsed. Without this the
    // in-flight cap would quietly cost the user 10 units per bounce.
    await hold.refund()
    throw new HttpsError("resource-exhausted", "Too many parses in progress; try again shortly.")
  }

  const requestId = randomUUID()
  const now = Timestamp.now()
  await manualRef.set(
    {
      parse: {
        stage: "queued",
        stageAt: now,
        requestId,
        mode,
        model: null,
        attempt: 0,
        error: null,
        summary: null,
      },
      updatedAt: now,
    },
    { merge: true }
  )

  await getFunctions()
    .taskQueue(`locations/${REGION}/functions/parseWorker`)
    .enqueue({ homeId, manualId, requestId, mode }, { dispatchDeadlineSeconds: 1800 })

  return { ok: true as const, requestId }
})
