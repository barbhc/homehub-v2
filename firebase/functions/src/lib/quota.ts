/**
 * Spend caps on the paid AI/search functions.
 *
 * Three things are true at once and each needs a different counter:
 *
 *   1. One user can loop. -> per-user daily cap (was the only cap here).
 *   2. Many users, or many accounts held by one person, cost many times that
 *      cap. Sign-up is open, so the per-user limit has no app-wide stop.
 *      -> global monthly ceiling.
 *   3. Not every call costs the same. Shipping a whole PDF to Opus is not one
 *      chat turn. -> cost-weighted units, not raw call counts.
 *
 * Charge AFTER auth + membership + input validation and BEFORE the paid work,
 * so rejected requests never burn quota. Then hand the charge back with
 * `hold.refund()` if the vendor produced nothing -- an Anthropic outage must
 * not cost someone their day. The old API charged and had no way to give it
 * back, which meant a run of our own 500s ate a user's allowance and then told
 * them to come back tomorrow.
 *
 * All counters are written via the Admin SDK only; firestore.rules
 * default-denies, so no client can read or reset them.
 */
import { HttpsError } from "firebase-functions/v2/https"
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore"
import {
  DAILY_AI_LIMIT,
  decideQuota,
  monthlyCeiling,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
} from "../../../../shared/quota/policy.js"

export {
  AI_UNIT_COST,
  DAILY_AI_LIMIT,
  DEFAULT_MONTHLY_UNIT_CEILING,
  decideQuota,
  monthlyCeiling,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
  type QuotaState,
  type QuotaVerdict,
} from "../../../../shared/quota/policy.js"

export function errorForVerdict(reason: "daily" | "global" | "invalid", limit: number): HttpsError {
  switch (reason) {
    case "daily":
      return new HttpsError(
        "resource-exhausted",
        `Daily AI limit reached (${limit} actions per day). It resets at midnight UTC — please try again tomorrow.`,
      )
    case "global":
      return new HttpsError(
        "resource-exhausted",
        "Homehub has hit its monthly AI budget. This isn't something you did — please try again next month.",
      )
    default:
      return new HttpsError(
        "internal",
        "Usage accounting is misconfigured. This has been logged.",
      )
  }
}

/** A charge already made. Give it back if the paid call produced nothing. */
export interface QuotaHold {
  units: number
  refund(): Promise<void>
}

/** A hold that costs nothing to release — for paths that never charged. */
export const NO_CHARGE: QuotaHold = { units: 0, refund: async () => {} }

function globalDoc(db: Firestore, monthKey: string) {
  // Its own collection rather than a sentinel uid under usage/: nothing here
  // is a user, and conflating the two invites a rules mistake later.
  return db.doc(`aiSpendGlobal/${monthKey}`)
}

/**
 * Consume `unitCostFor(fn)` units of `uid`'s daily quota AND the app-wide
 * monthly ceiling, or throw `resource-exhausted`.
 *
 * Both counters move inside one transaction, so a call blocked by the global
 * ceiling does not silently burn the caller's daily allowance on the way out.
 *
 * `fns.<fn>.charged` and `fns.<fn>.failed` on the monthly doc give per-function
 * attempt and failure counts (successes = charged - failed) — the cheapest
 * honest answer to "is this deployed function actually working in production?"
 */
export async function chargeAiQuota(
  db: Firestore,
  uid: string,
  fn: string,
  limit: number = DAILY_AI_LIMIT,
  unitsOverride?: number,
): Promise<QuotaHold> {
  const dayKey = utcDayKey()
  const monthKey = utcMonthKey()
  // Override for a call site whose cost genuinely differs from its function's
  // default -- e.g. a cache hit that skips every vendor the miss path fans out to.
  const units = unitsOverride ?? unitCostFor(fn)
  const ceiling = monthlyCeiling()

  const dailyRef = db.doc(`usage/${uid}/daily/${dayKey}`)
  const monthlyRef = globalDoc(db, monthKey)

  await db.runTransaction(async (tx) => {
    // Firestore requires every read before any write in a transaction.
    const [dailySnap, monthlySnap] = await Promise.all([tx.get(dailyRef), tx.get(monthlyRef)])

    // `units` is new; older docs only have `count`. Treat a pre-migration doc's
    // count as its unit total so today's existing usage still counts against
    // the cap instead of silently resetting to zero on deploy.
    const dailyUnits =
      (dailySnap.get("units") as number | undefined) ??
      (dailySnap.get("count") as number | undefined) ??
      0
    const monthlyUnits = (monthlySnap.get("units") as number | undefined) ?? 0

    const verdict = decideQuota({
      dailyUnits,
      dailyLimit: limit,
      monthlyUnits,
      monthlyCeiling: ceiling,
      units,
    })

    if (!verdict.allowed) {
      if (verdict.reason === "global") {
        console.error(
          `MONTHLY AI CEILING HIT: ${monthlyUnits}/${ceiling} units. Every paid ` +
            `function is refusing calls until the next UTC month.`,
        )
      }
      if (verdict.reason === "invalid") {
        console.error(
          `quota misconfigured for ${fn}: units=${units} dailyLimit=${limit} ceiling=${ceiling}`,
        )
      }
      throw errorForVerdict(verdict.reason, limit)
    }

    tx.set(
      dailyRef,
      {
        count: FieldValue.increment(1),
        units: FieldValue.increment(units),
        fns: { [fn]: FieldValue.increment(1) },
        updatedAt: FieldValue.serverTimestamp(),
        // Self-expires after 2 days if a TTL policy on expiresAt is configured
        // (same best-effort convention as the productLookup cache docs).
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400_000),
      },
      { merge: true },
    )

    tx.set(
      monthlyRef,
      {
        units: FieldValue.increment(units),
        calls: FieldValue.increment(1),
        fns: { [fn]: { charged: FieldValue.increment(1) } },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })

  let refunded = false
  return {
    units,
    async refund() {
      // Idempotent: handlers refund on a specific failure path and again in a
      // catch-all, and both can fire for one request. The daily doc aggregates
      // the whole day, so a second decrement would credit back a unit some
      // other call legitimately spent.
      if (refunded) return
      refunded = true
      try {
        await db.runTransaction(async (tx) => {
          const [dailySnap, monthlySnap] = await Promise.all([
            tx.get(dailyRef),
            tx.get(monthlyRef),
          ])
          const dailyUnits = (dailySnap.get("units") as number | undefined) ?? 0
          const dailyCount = (dailySnap.get("count") as number | undefined) ?? 0
          const monthlyUnits = (monthlySnap.get("units") as number | undefined) ?? 0
          const monthlyCalls = (monthlySnap.get("calls") as number | undefined) ?? 0

          // Floored at zero so a refund can never mint quota.
          tx.set(
            dailyRef,
            {
              units: Math.max(dailyUnits - units, 0),
              count: Math.max(dailyCount - 1, 0),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
          tx.set(
            monthlyRef,
            {
              units: Math.max(monthlyUnits - units, 0),
              calls: Math.max(monthlyCalls - 1, 0),
              // `charged` is deliberately NOT decremented: it is the attempt
              // count, and attempts minus failures is what tells us whether a
              // deployed function actually works.
              fns: { [fn]: { failed: FieldValue.increment(1) } },
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
        })
      } catch (err) {
        // Not rethrown: the caller is already handling the failure that
        // triggered this refund, and losing that error to a bookkeeping error
        // would be worse. Logged with everything needed to reconcile by hand.
        refunded = false // let a later catch-all retry it
        console.error(`quota refund failed for ${fn} (uid=${uid}, ${units}u on ${dayKey}):`, err)
      }
    },
  }
}

/**
 * Charge, run, and hand the charge back if the work threw.
 *
 * This is the shape every paid call site should use: it makes "don't bill for
 * a call that produced nothing" the default rather than something each handler
 * has to remember in each of its catch blocks.
 *
 *   return withAiQuota(db, uid, "chatQuery", async () => {
 *     ...the paid work...
 *   })
 *
 * The original error propagates untouched; the refund is a side effect on the
 * way out, and its own failures are logged rather than thrown so they cannot
 * mask what actually went wrong.
 */
export async function withAiQuota<T>(
  db: Firestore,
  uid: string,
  fn: string,
  work: () => Promise<T>,
  opts?: { limit?: number; units?: number },
): Promise<T> {
  const hold = await chargeAiQuota(db, uid, fn, opts?.limit ?? DAILY_AI_LIMIT, opts?.units)
  try {
    return await work()
  } catch (err) {
    await hold.refund()
    throw err
  }
}

/**
 * @deprecated Use `chargeAiQuota`, which also enforces the app-wide monthly
 * ceiling and returns a hold you can refund. Kept so any call site not yet
 * migrated still charges something rather than nothing.
 */
export async function consumeDailyAiQuota(
  db: Firestore,
  uid: string,
  fn: string,
  limit: number = DAILY_AI_LIMIT,
): Promise<void> {
  await chargeAiQuota(db, uid, fn, limit)
}
