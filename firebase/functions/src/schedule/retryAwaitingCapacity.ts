/**
 * retryAwaitingCapacity — the half of HH-124 that works while the app is closed.
 *
 * The owner hit the daily AI ceiling mid-scan and got a red error with a dead
 * "Try again" under it: "figure out a backup plan when I hit an AI limit …
 * the user should come back and when there is more AI capacity, [it] will scan
 * it." The client already parks a refused scan and restarts it the next time
 * that item is opened — but that only runs while someone has the app open, so
 * a manual refused at 11pm sat untouched until the next visit.
 *
 * This is the part that keeps the promise without the user present: an hourly
 * sweep over manuals parked at `awaiting_capacity`, oldest first, starting each
 * one whose owner has allowance again.
 *
 * Design notes, in the order they bite:
 *
 *  - **Charge the parker, not nobody.** The daily cap is per-user and this job
 *    has no caller, so `parse.awaiting.uid` records whose allowance to spend.
 *    Retrying on the wrong person's quota would be worse than not retrying.
 *  - **A global refusal ends the run.** If the app-wide monthly budget is gone,
 *    every further attempt is a wasted transaction against a counter that
 *    cannot move until the next month.
 *  - **A daily refusal skips one user, not the run.** Someone else's manual may
 *    still be startable, and the queue is oldest-first across all homes.
 *  - **Parked work expires.** A manual nobody has thought about for three days
 *    should not surprise them by parsing itself; it becomes a normal error the
 *    item page already knows how to show, with a button that works.
 *
 * `runCapacityRetry` is a plain function over an injected Firestore and two
 * injected effects, so the emulator test drives it without Cloud Tasks.
 */
import { onSchedule } from "firebase-functions/v2/scheduler"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { getFunctions } from "firebase-admin/functions"
import { randomUUID } from "node:crypto"
import { chargeAiQuota, quotaScope } from "../lib/quota.js"

const REGION = "us-central1"

/** Matches the client-side queue in `src/lib/scanCapacity.ts`. Both sides
 *  giving up at the same age keeps the two from disagreeing about whether a
 *  manual is still coming. */
export const MAX_PARKED_MS = 3 * 24 * 60 * 60 * 1000

/** Per run. Bounded so one sweep cannot drain the monthly budget in a minute;
 *  at hourly, this is far more throughput than the daily caps allow anyway. */
export const MAX_PER_RUN = 25

export interface CapacityRetryResult {
  scanned: number
  restarted: number
  /** Still over a per-user ceiling — left parked for the next sweep. */
  stillRefused: number
  /** Parked too long; turned into a visible error the user can act on. */
  expired: number
  /** The app-wide budget is gone; the run stopped early on purpose. */
  stoppedOnGlobalCeiling: boolean
}

export interface RetryEffects {
  /** Charge the parked user. Throws the same errors `chargeAiQuota` throws. */
  charge(uid: string): Promise<void>
  /** Hand the manual to the parse worker. */
  enqueue(payload: { homeId: string; manualId: string; requestId: string; mode: string }): Promise<void>
}

export async function runCapacityRetry(
  db: Firestore,
  effects: RetryEffects,
  nowMs: number,
  max: number = MAX_PER_RUN,
): Promise<CapacityRetryResult> {
  const parked = await db
    .collectionGroup("manuals")
    .where("parse.stage", "==", "awaiting_capacity")
    .orderBy("parse.awaiting.since", "asc")
    .limit(max)
    .get()

  const result: CapacityRetryResult = {
    scanned: parked.size,
    restarted: 0,
    stillRefused: 0,
    expired: 0,
    stoppedOnGlobalCeiling: false,
  }

  // Skip further attempts for a user already refused this run: their cap is
  // daily, so a second manual of theirs cannot possibly succeed a moment later.
  const spent = new Set<string>()

  for (const doc of parked.docs) {
    const homeRef = doc.ref.parent.parent // homes/{homeId}
    if (!homeRef) continue

    const uid = doc.get("parse.awaiting.uid") as string | undefined
    const since = doc.get("parse.awaiting.since") as Timestamp | undefined
    const mode = (doc.get("parse.mode") as string | undefined) ?? "preview"

    // No uid means nothing can be charged, so it can never start. Expire it
    // rather than leaving a doc that this job will scan forever.
    const ageMs = since ? nowMs - since.toMillis() : Number.POSITIVE_INFINITY
    if (!uid || ageMs > MAX_PARKED_MS) {
      await expire(doc.ref, uid ? "waited too long" : "missing owner")
      result.expired += 1
      continue
    }

    if (spent.has(uid)) {
      result.stillRefused += 1
      continue
    }

    try {
      await effects.charge(uid)
    } catch (err) {
      const scope = quotaScope(err)
      if (scope === "global") {
        // Nothing else in this run can succeed either.
        result.stoppedOnGlobalCeiling = true
        break
      }
      if (scope === "daily") {
        spent.add(uid)
        result.stillRefused += 1
        continue
      }
      // Anything else (a rate limit, a transient Firestore error) is not this
      // job's to interpret. Leave the manual parked and let the next sweep try.
      result.stillRefused += 1
      continue
    }

    const requestId = randomUUID()
    const now = Timestamp.now()
    await doc.ref.set(
      {
        parse: {
          stage: "queued",
          stageAt: now,
          requestId,
          mode,
          attempt: 0,
          error: null,
          // Clearing this is what stops a started manual being picked up twice.
          awaiting: null,
        },
        updatedAt: now,
      },
      { merge: true },
    )

    await effects.enqueue({ homeId: homeRef.id, manualId: doc.id, requestId, mode })
    result.restarted += 1
  }

  return result
}

async function expire(ref: FirebaseFirestore.DocumentReference, why: string) {
  const now = Timestamp.now()
  await ref.set(
    {
      parse: {
        stage: "error",
        stageAt: now,
        // Says what happened without blaming the user or the manual, and leaves
        // them the retry button the error state already renders.
        error: {
          message: `We didn't get to this one (${why}). Tap to scan it now.`,
          stage: "awaiting_capacity",
          at: now,
        },
        awaiting: null,
      },
      updatedAt: now,
    },
    { merge: true },
  )
}

export const retryAwaitingCapacity = onSchedule(
  {
    // Hourly rather than daily: the per-user cap resets at UTC midnight, but
    // the app-wide budget frees up continuously as other usage ages out, and
    // the client copy promises "usually within a few hours".
    schedule: "every 60 minutes",
    region: REGION,
    timeZone: "Etc/UTC",
    retryCount: 0,
  },
  async () => {
    const db = getFirestore()
    const result = await runCapacityRetry(
      db,
      {
        charge: async (uid) => {
          await chargeAiQuota(db, uid, "enqueueParse")
        },
        enqueue: async (payload) => {
          await getFunctions()
            .taskQueue(`locations/${REGION}/functions/parseWorker`)
            .enqueue(payload, { dispatchDeadlineSeconds: 1800 })
        },
      },
      Date.now(),
    )
    console.log(
      `retryAwaitingCapacity: scanned=${result.scanned} restarted=${result.restarted} ` +
        `stillRefused=${result.stillRefused} expired=${result.expired} ` +
        `stoppedOnGlobalCeiling=${result.stoppedOnGlobalCeiling}`,
    )
  },
)
