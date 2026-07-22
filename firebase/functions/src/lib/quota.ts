/**
 * Per-user daily quota on the paid AI/search functions (launch-readiness P0).
 * One counter doc per user per UTC day at usage/{uid}/daily/{yyyy-mm-dd},
 * checked-and-incremented transactionally at the top of every paid call. The
 * cap is generous — real use is a handful of AI actions a day — so it stops
 * runaway client loops and leaked/scripted links, not friends.
 *
 * Charge AFTER auth + membership + input validation and BEFORE the paid work,
 * so rejected requests never burn quota. The `usage` collection is written via
 * the Admin SDK only (no client rules needed; firestore.rules default-denies).
 */
import { HttpsError } from "firebase-functions/v2/https"
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore"

export const DAILY_AI_LIMIT = 50

/** yyyy-mm-dd in UTC (quota day rolls at midnight UTC). */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Consume one unit of `uid`'s daily quota or throw `resource-exhausted`.
 * `fn` is the calling function's name — tallied per-function in the counter
 * doc so a runaway caller is identifiable at a glance.
 */
export async function consumeDailyAiQuota(
  db: Firestore,
  uid: string,
  fn: string,
  limit: number = DAILY_AI_LIMIT,
): Promise<void> {
  const ref = db.doc(`usage/${uid}/daily/${utcDayKey()}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const count = (snap.get("count") as number | undefined) ?? 0
    if (count >= limit) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily AI limit reached (${limit} actions per day). It resets at midnight UTC — please try again tomorrow.`,
      )
    }
    tx.set(
      ref,
      {
        count: FieldValue.increment(1),
        fns: { [fn]: FieldValue.increment(1) },
        updatedAt: FieldValue.serverTimestamp(),
        // Self-expires after 2 days if a TTL policy on expiresAt is configured
        // (same best-effort convention as the productLookup cache docs).
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400_000),
      },
      { merge: true },
    )
  })
}
