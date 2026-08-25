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
  BURST_UNIT_LIMIT,
  DAILY_AI_LIMIT,
  decideQuota,
  decideRateLimit,
  monthlyCeiling,
  dailyCallLimitFor,
  rateLimitFor,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
  type RateWindow,
} from "../../../../shared/quota/policy.js"
import { isQuotaExhaustedMessage } from "../../../../shared/quota/refusal.js"

export {
  AI_RATE_LIMIT,
  AI_UNIT_COST,
  BURST_UNIT_LIMIT,
  DAILY_AI_LIMIT,
  DEFAULT_MONTHLY_UNIT_CEILING,
  RATE_WINDOW_MS,
  decideQuota,
  decideRateLimit,
  monthlyCeiling,
  rateLimitFor,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
  type QuotaState,
  type QuotaVerdict,
  type RateState,
  type RateVerdict,
  type RateWindow,
} from "../../../../shared/quota/policy.js"

export function errorForVerdict(
  reason: "daily" | "global" | "invalid" | "fnDaily",
  limit: number,
  ctx?: { fn: string; fnLimit: number | null },
): HttpsError {
  switch (reason) {
    case "fnDaily":
      // Named for the thing the user did, not for the function that ran. The
      // only capped call today is the parse, so this says "scans"; if another
      // ever gets a cap, give it a word here rather than leaking a function
      // name into a sentence a homeowner reads.
      return new HttpsError(
        "resource-exhausted",
        ctx?.fn === "enqueueParse"
          ? `That's ${ctx.fnLimit} manual scans today — the daily limit. Your manual is saved and queued.`
          : `Daily limit reached for this action (${ctx?.fnLimit}). Your work is saved and queued.`,
        // Same shape the ceiling refusals use, so the retry job and the client
        // both treat it as "come back later", not as a failure.
        { kind: "quota_exhausted", scope: "daily" },
      )
    case "daily":
      return new HttpsError(
        "resource-exhausted",
        `Daily AI limit reached (${limit} actions per day). Your work is saved and queued.`,
        // HH-124: the message no longer names midnight UTC or tells anyone to
        // "try again tomorrow". It said both, and both were wrong — UTC is our
        // clock rather than theirs, and a parse refused here is now retried FOR
        // them by retryAwaitingCapacity, so instructing them to come back and
        // redo it describes work that already has an owner.
        //
        // `scope` is what the retry job branches on. Matching the sentence with
        // a regex would make this copy load-bearing, and the whole reason the
        // client keeps its own wording is that server copy can only change with
        // a functions deploy.
        { kind: "quota_exhausted", scope: "daily" },
      )
    case "global":
      return new HttpsError(
        "resource-exhausted",
        "Homehub has hit its monthly AI budget. This isn't something you did — your work is saved and queued.",
        { kind: "quota_exhausted", scope: "global" },
      )
    default:
      return new HttpsError(
        "internal",
        "Usage accounting is misconfigured. This has been logged.",
      )
  }
}

/**
 * The too-fast error. Separate from `errorForVerdict` on purpose: both are
 * `resource-exhausted`, but one means "come back tomorrow" and the other means
 * "come back in nine seconds", and telling a user the wrong one of those is the
 * difference between a shrug and abandoning the app.
 */
export function errorForRate(reason: "endpoint" | "burst", retryAfterSeconds: number): HttpsError {
  const wait =
    retryAfterSeconds <= 1 ? "a second" : `about ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`
  return new HttpsError(
    "resource-exhausted",
    reason === "endpoint"
      ? `That's a lot of requests at once — please wait ${wait} and try again.`
      : `Homehub is catching up with your last few actions — please wait ${wait} and try again.`,
    // Structured detail so a client can back off intelligently rather than
    // regex the sentence above. `kind` distinguishes this from a daily/monthly
    // exhaustion, which needs a completely different message and no retry.
    { kind: "rate_limited", reason, retryAfterSeconds },
  )
}

/**
 * Was this refusal a CEILING (daily allowance or the app-wide monthly budget),
 * as opposed to a rate limit or a real failure?
 *
 * Reads the structured detail rather than the sentence. The distinction matters
 * because the two are both `resource-exhausted` but call for opposite handling:
 * a ceiling should park the work and retry it later, while a rate limit means
 * "wait a few seconds", and parking those would queue work the user is about to
 * redo by hand.
 */
export function isQuotaExhausted(err: unknown): boolean {
  if (quotaScope(err) !== null) return true
  // Fallback to the message when details are absent. They can be: an older
  // client SDK, a transport that drops them, or an error re-thrown as a plain
  // Error somewhere in between. Without this the retry job would treat a
  // ceiling as an unknown failure and leave the work unparked — the same
  // failure the client had, from the other side.
  const msg = (err as { message?: unknown })?.message
  return typeof msg === "string" && isQuotaExhaustedMessage(msg)
}

/** `"daily"` (this user is done for the day) vs `"global"` (nobody can spend). */
export function quotaScope(err: unknown): "daily" | "global" | null {
  const details = (err as { details?: unknown })?.details as
    | { kind?: unknown; scope?: unknown }
    | undefined
  if (!details || details.kind !== "quota_exhausted") return null
  return details.scope === "daily" || details.scope === "global" ? details.scope : null
}

/** A charge already made. Give it back if the paid call produced nothing. */
export interface QuotaHold {
  units: number
  refund(): Promise<void>
}

/** A hold that costs nothing to release — for paths that never charged. */
export const NO_CHARGE: QuotaHold = { units: 0, refund: async () => {} }

/**
 * Read a stored rate window, tolerating every shape a document can be in:
 * absent (first call of the day), partially written, or holding junk from an
 * older schema. Anything unusable reads as an empty window opened at epoch 0,
 * which `decideRateLimit` treats as expired and resets — the safe direction,
 * since the daily and monthly caps are still underneath.
 */
function readWindow(raw: unknown): RateWindow {
  const w = raw as Partial<RateWindow> | undefined
  const windowStart = typeof w?.windowStart === "number" && Number.isFinite(w.windowStart) ? w.windowStart : 0
  const value = typeof w?.value === "number" && Number.isFinite(w.value) && w.value >= 0 ? w.value : 0
  return { windowStart, value }
}

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

  const nowMs = Date.now()

  await db.runTransaction(async (tx) => {
    // Firestore requires every read before any write in a transaction.
    const [dailySnap, monthlySnap] = await Promise.all([tx.get(dailyRef), tx.get(monthlyRef)])

    // ── Rate limit ────────────────────────────────────────────────────────
    // Read off the SAME snapshot the quota check uses, so throttling costs no
    // extra Firestore round-trip, and decided BEFORE the counters below so a
    // call rejected for going too fast never spends the allowance it is being
    // protected from spending.
    const rateVerdict = decideRateLimit({
      now: nowMs,
      fnWindow: readWindow(dailySnap.get(`rate.fns.${fn}`)),
      fnLimit: rateLimitFor(fn),
      burstWindow: readWindow(dailySnap.get("rate.burst")),
      burstLimit: BURST_UNIT_LIMIT,
      units,
    })
    if (!rateVerdict.allowed) {
      throw errorForRate(rateVerdict.reason, rateVerdict.retryAfterSeconds)
    }

    // `units` is new; older docs only have `count`. Treat a pre-migration doc's
    // count as its unit total so today's existing usage still counts against
    // the cap instead of silently resetting to zero on deploy.
    const dailyUnits =
      (dailySnap.get("units") as number | undefined) ??
      (dailySnap.get("count") as number | undefined) ??
      0
    const monthlyUnits = (monthlySnap.get("units") as number | undefined) ?? 0

    // Per-function CALL count for today. Written below as `fns.{fn}` on the
    // same doc the unit totals live on, so the check and the increment cannot
    // disagree — the same reason decideQuota lives beside the transaction.
    const fnCallsToday = (dailySnap.get(`fns.${fn}`) as number | undefined) ?? 0

    const verdict = decideQuota({
      dailyUnits,
      dailyLimit: limit,
      monthlyUnits,
      monthlyCeiling: ceiling,
      units,
      fnCallsToday,
      fnCallLimit: dailyCallLimitFor(fn),
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
      throw errorForVerdict(verdict.reason, limit, {
        fn,
        fnLimit: dailyCallLimitFor(fn),
      })
    }

    tx.set(
      dailyRef,
      {
        count: FieldValue.increment(1),
        units: FieldValue.increment(units),
        fns: { [fn]: FieldValue.increment(1) },
        // Absolute values, not increments: decideRateLimit already folded the
        // window reset into these, and an increment cannot express "the window
        // rolled over, start again at 1".
        rate: {
          fns: { [fn]: rateVerdict.fnWindow },
          burst: rateVerdict.burstWindow,
        },
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
