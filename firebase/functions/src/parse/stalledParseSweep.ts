/**
 * The stalled-parse sweep — ends scans whose worker stopped writing.
 *
 * A worker attempt killed at the Cloud Tasks deadline (or by a crash) leaves
 * the manual at an active stage forever. Before this, that stage:
 *   - showed "Reading the manual" on the item page and in the tray, forever;
 *   - held one of the home's MAX_IN_FLIGHT slots, forever;
 *   - (once enqueueParse learned to refuse a manual already being read) would
 *     have made that manual unscannable, forever.
 *
 * An active stage with no write for STALE_PARSE_MS is dead (parseState.ts says
 * why that bound is safe). This turns it into an `error` the page already
 * knows how to show — ParsePickupCard's "We couldn't finish reading the
 * manual", the tray drops it, and the manual card's scan button starts a fresh
 * run — and gives the charge back if the run never reached Claude (the ledger
 * says so: `held`). The requestId is KEPT, so a client following that run sees
 * it end; the late worker, if one ever wakes, finds the stage ended and stops.
 *
 * Runs at the start of every hourly retryAwaitingCapacity tick, isolated so a
 * failure here can never stop the capacity retries.
 *
 * Needs the `manuals.parse.stage` COLLECTION_GROUP index (firestore.indexes.json);
 * the emulator does not enforce indexes, so deploy the indexes before this.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { PARSE_ERR } from "../../../../shared/parse/parseErrors.js"
import { refundParseCharge } from "../lib/parseCharges.js"
import { ACTIVE_STAGES, runLiveness } from "./parseState.js"

export interface StalledSweepResult {
  /** Active manuals looked at. */
  scanned: number
  /** Stalled runs turned into errors. */
  ended: number
  /** Of those, how many had their charge given back. */
  refunded: number
}

export async function runStalledParseSweep(
  db: Firestore,
  nowMs: number,
  opts?: {
    /** Tests only: limit the sweep to their own homes. node --test runs the
     *  suites concurrently against one emulator, and this query is app-wide. */
    scope?: (homeId: string) => boolean
  },
): Promise<StalledSweepResult> {
  const active = await db.collectionGroup("manuals").where("parse.stage", "in", ACTIVE_STAGES).get()
  const result: StalledSweepResult = { scanned: active.size, ended: 0, refunded: 0 }

  for (const doc of active.docs) {
    const homeId = doc.ref.parent.parent?.id
    if (!homeId || (opts?.scope && !opts.scope(homeId))) continue
    const seen = runLiveness(doc.get("parse"), nowMs)
    if (seen.state !== "stalled") continue

    // End it only if nothing has moved since we looked: same run, same stage,
    // and still stalled by the clock at commit time.
    const ended = await db.runTransaction(async (tx) => {
      const cur = await tx.get(doc.ref)
      const now = runLiveness(cur.get("parse"), Date.now())
      if (now.state !== "stalled" || now.requestId !== seen.requestId || now.stage !== seen.stage) return false
      const at = Timestamp.now()
      tx.set(
        doc.ref,
        {
          parse: {
            stage: "error",
            stageAt: at,
            requestId: seen.requestId,
            retry: null,
            error: {
              message: PARSE_ERR.stalled,
              raw: `no stage write for ${seen.ageMs === null ? "an unknown time" : `${Math.round(seen.ageMs / 60_000)} min`} at ${seen.stage}`,
              stage: seen.stage,
              at,
              reason: "stalled",
            },
          },
          updatedAt: at,
        },
        { merge: true },
      )
      return true
    })
    if (!ended) continue
    result.ended += 1
    // The sweep cannot know whether a call it did not make produced anything,
    // so it refunds only a charge whose Claude call never started.
    if (seen.requestId && (await refundParseCharge(db, seen.requestId, { from: ["held"], reason: "stalled" }))) {
      result.refunded += 1
    }
    console.warn("[stalledParseSweep] ended a stalled scan", {
      homeId,
      manualId: doc.id,
      requestId: seen.requestId,
      stage: seen.stage,
      ageMinutes: seen.ageMs === null ? null : Math.round(seen.ageMs / 60_000),
    })
  }
  return result
}
