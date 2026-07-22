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
import { consumeDailyAiQuota } from "../lib/quota.js"

const REGION = "us-central1"
/** Per-home cap on simultaneously in-flight parses (queue drains a bulk rescan
 *  serially via the worker's maxConcurrentDispatches; this stops runaway fan-out
 *  at enqueue time). */
const MAX_IN_FLIGHT = 5
const ACTIVE_STAGES = ["queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"]

export const enqueueParse = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")

  const { homeId, manualId, mode = "commit" } = (request.data ?? {}) as {
    homeId?: string
    manualId?: string
    mode?: ParseMode
  }
  if (!homeId || !manualId) throw new HttpsError("invalid-argument", "homeId and manualId are required.")

  const db = getFirestore()

  // Membership check (Admin SDK bypasses rules — enforce here).
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home.")

  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)
  const manual = await manualRef.get()
  if (!manual.exists) throw new HttpsError("not-found", "Manual not found.")

  // The parse worker is the most expensive Claude call in the app — charge the
  // enqueuing user's daily quota here (the worker itself has no caller context).
  await consumeDailyAiQuota(db, uid, "enqueueParse")

  // In-flight cap.
  const inFlight = await db
    .collection(`homes/${homeId}/manuals`)
    .where("parse.stage", "in", ACTIVE_STAGES)
    .count()
    .get()
  if (inFlight.data().count >= MAX_IN_FLIGHT) {
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
