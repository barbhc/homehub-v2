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
 * The numbers come from the server-only `config/spend` document, read inside
 * the SAME transaction as the counters (shared/quota/policy.ts explains the
 * document and its defaults). `monthlyCeilingUnits: 0` there stops every paid
 * call in the app on the next request — no deploy.
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
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from "firebase-admin/firestore"
import {
  BURST_UNIT_LIMIT,
  DAILY_CALL_CAP,
  dailyCallLimitFor,
  dailyLimitFor,
  decideQuota,
  decideRateLimit,
  effectiveMonthlyCeiling,
  parseSpendConfig,
  rateLimitFor,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
  type RateWindow,
  type SpendConfig,
} from "../../../../shared/quota/policy.js"
import { isQuotaExhaustedMessage } from "../../../../shared/quota/refusal.js"

export {
  AI_RATE_LIMIT,
  AI_UNIT_COST,
  BURST_UNIT_LIMIT,
  DEFAULT_DAILY_UNITS,
  DEFAULT_MONTHLY_UNIT_CEILING,
  DEFAULT_SPEND_CONFIG,
  RATE_WINDOW_MS,
  decideQuota,
  decideRateLimit,
  dailyCallLimitFor,
  dailyLimitFor,
  effectiveMonthlyCeiling,
  parseSpendConfig,
  rateLimitFor,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
  type QuotaState,
  type QuotaVerdict,
  type RateState,
  type RateVerdict,
  type RateWindow,
  type SpendConfig,
} from "../../../../shared/quota/policy.js"

/** The server-only caps document. firestore.rules gives clients nothing here. */
export const SPEND_CONFIG_DOC = "config/spend"

/**
 * The refusal a user reads. Every sentence here must still be recognised by
 * `isQuotaExhaustedMessage` (shared/quota/refusal.ts) — including by the
 * client ALREADY DEPLOYED, whose copy of that matcher is older than this file:
 * that is why each one still leads with a phrase the old matcher knows
 * ("daily ai limit", "monthly ai budget", "manual scans today").
 * test/refusalRecognition.emu.test.mjs pins it.
 *
 * `ctx.fn` decides whether "saved and queued" is true. It is for a manual scan
 * — a refused scan is parked and retryAwaitingCapacity starts it later — and it
 * was false for everything else: an Ask question refused at the cap was told
 * its work was queued, and nothing was.
 */
export function errorForVerdict(
  reason: "daily" | "global" | "invalid" | "fnDaily",
  ctx?: { fn?: string; fnLimit?: number | null },
): HttpsError {
  const isScan = ctx?.fn === "enqueueParse"
  switch (reason) {
    case "fnDaily":
      // Named for the thing the user did, not for the function that ran. The
      // only capped call today is the parse, so this says "scans"; if another
      // ever gets a cap, give it a word here rather than leaking a function
      // name into a sentence a homeowner reads.
      return new HttpsError(
        "resource-exhausted",
        isScan
          ? ctx?.fnLimit
            ? `That's ${ctx.fnLimit} manual scans today — the daily limit. Your manual is saved and queued.`
            : "Daily AI limit reached for manual scans. Your manual is saved and queued."
          : `Daily limit reached for this action (${ctx?.fnLimit ?? 0}). It frees up again within a day.`,
        // Same shape the ceiling refusals use, so the retry job and the client
        // both treat it as "come back later", not as a failure.
        { kind: "quota_exhausted", scope: "daily" },
      )
    case "daily":
      return new HttpsError(
        "resource-exhausted",
        // No number: units are not "actions" (a scan is 10 of them), so "50
        // actions per day" told someone who had done six things that they had
        // done fifty. No clock either (HH-124): UTC midnight is ours, not theirs.
        isScan
          ? "Daily AI limit reached. Your manual is saved and queued — it scans automatically when there's room."
          : "Daily AI limit reached — it frees up again within a day.",
        // `scope` is what the retry job branches on. Matching the sentence with
        // a regex would make this copy load-bearing, and the whole reason the
        // client keeps its own wording is that server copy can only change with
        // a functions deploy.
        { kind: "quota_exhausted", scope: "daily" },
      )
    case "global":
      return new HttpsError(
        "resource-exhausted",
        isScan
          ? "Homehub has hit its monthly AI budget. This isn't something you did — your manual is saved and queued."
          : "Homehub has hit its monthly AI budget. This isn't something you did — AI features are paused for now.",
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

/** Where a charge landed — enough to hand it back from another process. */
export interface ChargeRecord {
  uid: string
  fn: string
  units: number
  /** usage/{uid}/daily/{day} — the day it was charged, not the day it is refunded. */
  day: string
  /** aiSpendGlobal/{month}. */
  month: string
}

/** A charge already made. Give it back if the paid call produced nothing. */
export interface QuotaHold {
  /** Units still held — `release()` lowers it. */
  units: number
  /** Where it was charged. Null for NO_CHARGE. */
  record: ChargeRecord | null
  /** Hand back everything still held and count the call as failed. Idempotent. */
  refund(): Promise<void>
  /** Hand back PART of the charge — the call turned out cheaper than priced
   *  (a manual PDF chatQuery could not fetch). The call itself still counts. */
  release(units: number): Promise<void>
  /**
   * Charge MORE for this same call, when its price is only known partway
   * through: an Ask turn learns how many manual PDFs it will attach after the
   * charge that let it start. Same caps as the first charge (daily pool,
   * monthly ceiling, and the burst window, which takes the extra units); the
   * per-endpoint window is not ticked again — it is one call. Throws the same
   * refusals chargeAiQuota throws; on a refusal nothing extra is charged and
   * what was already held is still held (the caller decides whether to refund).
   */
  extend(units: number): Promise<void>
}

/** A hold that costs nothing to release — for paths that never charged. */
export const NO_CHARGE: QuotaHold = {
  units: 0,
  record: null,
  refund: async () => {},
  release: async () => {},
  extend: async () => {
    throw new Error("NO_CHARGE cannot be extended — charge the call first")
  },
}

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

/** The last problem set logged, so a broken config/spend is reported once per
 *  instance rather than once per call. */
let loggedConfigProblems = ""

/** config/spend as the charge sees it. Problems are logged, never thrown: a
 *  malformed document must not turn into an outage of every paid function
 *  (parseSpendConfig already picked the safe value for each bad field). */
function spendConfigFrom(snap: DocumentSnapshot): SpendConfig {
  const { config, problems } = parseSpendConfig(snap.exists ? snap.data() : undefined)
  if (problems.length > 0) {
    const key = problems.join(" | ")
    if (key !== loggedConfigProblems) {
      loggedConfigProblems = key
      console.error(`[quota] ${SPEND_CONFIG_DOC} has problems: ${key}`)
    }
  }
  return config
}

/**
 * config/spend read OUTSIDE a charge — for the one setting in it that is not a
 * cap: `parseCacheBreakpoint`, which the parse worker reads per attempt. Same
 * parser and the same once-per-instance problem log as the charge's read.
 * Throws only if Firestore does; callers decide what a failed read means.
 */
export async function readSpendConfig(db: Firestore, configDoc: string = SPEND_CONFIG_DOC): Promise<SpendConfig> {
  return spendConfigFrom(await db.doc(configDoc).get())
}

/**
 * Consume units of `uid`'s daily quota AND the app-wide monthly ceiling, or
 * throw `resource-exhausted`.
 *
 * Both counters move inside one transaction, so a call blocked by the global
 * ceiling does not silently burn the caller's daily allowance on the way out.
 * The caps are read from config/spend in that same transaction.
 *
 * There is deliberately no per-call-site limit argument any more (C6): that
 * argument was compared with the user's TOTAL daily units across every
 * function, so findManual's "60 searches a day" meant "refuse anyone who has
 * spent 60 units on anything". A function that needs a different pool gets a
 * relative multiplier in policy.ts (DAILY_POOL_MULTIPLIER).
 *
 * `fns.<fn>.charged` and `fns.<fn>.failed` on the monthly doc give per-function
 * attempt and failure counts (successes = charged - failed) — the cheapest
 * honest answer to "is this deployed function actually working in production?"
 */
export async function chargeAiQuota(
  db: Firestore,
  uid: string,
  fn: string,
  opts?: {
    /** For a call site whose cost genuinely differs from its function's
     *  default — a cache hit that skips every vendor the miss path fans out
     *  to, or an Ask turn carrying manual PDFs. */
    units?: number
    /** The caps document to read. Production never passes it; the emulator
     *  tests point it at their own document so a test that throws the kill
     *  switch cannot stop the test files running beside it. */
    configDoc?: string
    /** The clock. Production never passes it. The emulator suites run in
     *  parallel, and every charge transacts on the app-wide
     *  `aiSpendGlobal/{month}` document; a suite that pins its own date gets
     *  its own month's document instead of aborting on the others' locks. */
    at?: Date
  },
): Promise<QuotaHold> {
  const clock = () => opts?.at?.getTime() ?? Date.now()
  const dayKey = utcDayKey(new Date(clock()))
  const monthKey = utcMonthKey(new Date(clock()))
  const units = opts?.units ?? unitCostFor(fn)

  const dailyRef = db.doc(`usage/${uid}/daily/${dayKey}`)
  const monthlyRef = globalDoc(db, monthKey)
  const configRef = db.doc(opts?.configDoc ?? SPEND_CONFIG_DOC)

  const nowMs = clock()

  await db.runTransaction(async (tx) => {
    // Firestore requires every read before any write in a transaction.
    const [dailySnap, monthlySnap, configSnap] = await Promise.all([
      tx.get(dailyRef),
      tx.get(monthlyRef),
      tx.get(configRef),
    ])
    const config = spendConfigFrom(configSnap)
    const ceiling = effectiveMonthlyCeiling(config)
    const dailyLimit = dailyLimitFor(config, uid, fn)
    const fnCallLimit = dailyCallLimitFor(fn, config)

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
      dailyLimit,
      monthlyUnits,
      monthlyCeiling: ceiling,
      units,
      fnCallsToday,
      fnCallLimit,
    })

    if (!verdict.allowed) {
      if (verdict.reason === "global") {
        console.error(
          ceiling === 0
            ? `AI KILL SWITCH ON: ${SPEND_CONFIG_DOC}.monthlyCeilingUnits is 0 (or AI_MONTHLY_UNIT_CEILING stopped it). ` +
                `Every paid function is refusing calls.`
            : `MONTHLY AI CEILING HIT: ${monthlyUnits}/${ceiling} units. Every paid ` +
                `function is refusing calls until the next UTC month or a higher ceiling in ${SPEND_CONFIG_DOC}.`,
        )
      }
      if (verdict.reason === "invalid") {
        console.error(
          `quota misconfigured for ${fn}: units=${units} dailyLimit=${dailyLimit} ceiling=${ceiling}`,
        )
      }
      throw errorForVerdict(verdict.reason, { fn, fnLimit: fnCallLimit })
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

  const record: ChargeRecord = { uid, fn, units, day: dayKey, month: monthKey }
  let held = units
  let refunded = false
  const hold: QuotaHold = {
    units,
    record,
    async refund() {
      // Idempotent: handlers refund on a specific failure path and again in a
      // catch-all, and both can fire for one request. The daily doc aggregates
      // the whole day, so a second decrement would credit back a unit some
      // other call legitimately spent.
      if (refunded) return
      refunded = true
      try {
        await giveBack(db, record, held, { wholeCall: true })
        held = 0
        hold.units = 0
      } catch (err) {
        // Not rethrown: the caller is already handling the failure that
        // triggered this refund, and losing that error to a bookkeeping error
        // would be worse. Logged with everything needed to reconcile by hand.
        refunded = false // let a later catch-all retry it
        console.error(`quota refund failed for ${fn} (uid=${uid}, ${held}u on ${dayKey}):`, err)
      }
    },
    async release(part: number) {
      const n = Math.min(Math.max(0, Math.floor(part)), held)
      if (refunded || n === 0) return
      try {
        await giveBack(db, record, n, { wholeCall: false })
        held -= n
        hold.units = held
      } catch (err) {
        // Same reasoning as refund(): logged for reconciliation, never thrown
        // over the work in progress. The user is over-charged by `n` units.
        console.error(`quota partial release failed for ${fn} (uid=${uid}, ${n}u on ${dayKey}):`, err)
      }
    },
    async extend(extra: number) {
      if (refunded) throw new Error(`cannot extend a refunded ${fn} charge`)
      if (!Number.isInteger(extra) || extra <= 0) return
      // Same clock as the charge, so the burst window it wrote is the one read.
      const topUpAt = clock()
      await db.runTransaction(async (tx) => {
        const [dailySnap, monthlySnap, configSnap] = await Promise.all([
          tx.get(dailyRef),
          tx.get(monthlyRef),
          tx.get(configRef),
        ])
        const config = spendConfigFrom(configSnap)
        const ceiling = effectiveMonthlyCeiling(config)
        const dailyLimit = dailyLimitFor(config, uid, fn)
        // The burst rule, reused as-is: a per-endpoint window that always has
        // room (this is the same call, already counted), so only the unit
        // burst decides.
        const burst = decideRateLimit({
          now: topUpAt,
          fnWindow: { windowStart: topUpAt, value: 0 },
          fnLimit: 1,
          burstWindow: readWindow(dailySnap.get("rate.burst")),
          burstLimit: BURST_UNIT_LIMIT,
          units: extra,
        })
        if (!burst.allowed) throw errorForRate(burst.reason, burst.retryAfterSeconds)
        const verdict = decideQuota({
          dailyUnits: (dailySnap.get("units") as number | undefined) ?? 0,
          dailyLimit,
          monthlyUnits: (monthlySnap.get("units") as number | undefined) ?? 0,
          monthlyCeiling: ceiling,
          units: extra,
        })
        if (!verdict.allowed) throw errorForVerdict(verdict.reason, { fn, fnLimit: null })
        tx.set(
          dailyRef,
          { units: FieldValue.increment(extra), rate: { burst: burst.burstWindow }, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
        tx.set(
          monthlyRef,
          { units: FieldValue.increment(extra), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      })
      held += extra
      record.units += extra
      hold.units = held
    },
  }
  return hold
}

/**
 * The refund writes, for a transaction that has already read both counter docs
 * (Firestore wants every read before any write). Floored at zero so a refund
 * can never mint quota.
 *
 * `wholeCall` = the call itself produced nothing: its `count`/`calls` come off
 * too and it is tallied as `failed`. A partial release leaves those alone — the
 * call happened, it just cost less than it was priced at.
 */
export function writeRefund(
  tx: Transaction,
  db: Firestore,
  record: ChargeRecord,
  units: number,
  snaps: { daily: DocumentSnapshot; monthly: DocumentSnapshot },
  opts: { wholeCall: boolean },
): void {
  const dailyUnits = (snaps.daily.get("units") as number | undefined) ?? 0
  const dailyCount = (snaps.daily.get("count") as number | undefined) ?? 0
  const monthlyUnits = (snaps.monthly.get("units") as number | undefined) ?? 0
  const monthlyCalls = (snaps.monthly.get("calls") as number | undefined) ?? 0
  tx.set(
    db.doc(`usage/${record.uid}/daily/${record.day}`),
    {
      units: Math.max(dailyUnits - units, 0),
      ...(opts.wholeCall ? { count: Math.max(dailyCount - 1, 0) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  tx.set(
    globalDoc(db, record.month),
    {
      units: Math.max(monthlyUnits - units, 0),
      ...(opts.wholeCall
        ? {
            calls: Math.max(monthlyCalls - 1, 0),
            // `charged` is deliberately NOT decremented: it is the attempt
            // count, and attempts minus failures is what tells us whether a
            // deployed function actually works.
            fns: { [record.fn]: { failed: FieldValue.increment(1) } },
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

/** The two counter docs a charge record points at. */
export function counterRefs(db: Firestore, record: ChargeRecord) {
  return { daily: db.doc(`usage/${record.uid}/daily/${record.day}`), monthly: globalDoc(db, record.month) }
}

async function giveBack(db: Firestore, record: ChargeRecord, units: number, opts: { wholeCall: boolean }): Promise<void> {
  if (units <= 0 && !opts.wholeCall) return
  const refs = counterRefs(db, record)
  await db.runTransaction(async (tx) => {
    const [daily, monthly] = await Promise.all([tx.get(refs.daily), tx.get(refs.monthly)])
    writeRefund(tx, db, record, units, { daily, monthly }, opts)
  })
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
  opts?: { units?: number },
): Promise<T> {
  const hold = await chargeAiQuota(db, uid, fn, opts)
  try {
    return await work()
  } catch (err) {
    await hold.refund()
    throw err
  }
}

/**
 * Rate-limit (and, where DAILY_CALL_CAP names it, day-cap) an endpoint that
 * spends no AI units — proxyPdf's egress. Same per-user usage doc and the same
 * `decideRateLimit` rule as the AI calls, in one transaction; the AI unit
 * counters are never touched.
 *
 * Throws `resource-exhausted`: `kind: "rate_limited"` (wait seconds) or
 * `kind: "call_cap"` (done for today).
 */
export async function enforceCallLimits(db: Firestore, uid: string, fn: string): Promise<void> {
  const dailyRef = db.doc(`usage/${uid}/daily/${utcDayKey()}`)
  const nowMs = Date.now()
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(dailyRef)
    const verdict = decideRateLimit({
      now: nowMs,
      fnWindow: readWindow(snap.get(`rate.fns.${fn}`)),
      fnLimit: rateLimitFor(fn),
      // Zero units: this call adds nothing to the AI burst window, and the
      // window is read only so the shared rule stays the one rule.
      burstWindow: readWindow(snap.get("rate.burst")),
      burstLimit: BURST_UNIT_LIMIT,
      units: 0,
    })
    if (!verdict.allowed) throw errorForRate(verdict.reason, verdict.retryAfterSeconds)

    const cap = DAILY_CALL_CAP[fn]
    const used = (snap.get(`fns.${fn}`) as number | undefined) ?? 0
    if (cap !== undefined && used + 1 > cap) {
      throw new HttpsError("resource-exhausted", "That's today's limit for this — it resets within a day.", {
        kind: "call_cap",
        fn,
        cap,
      })
    }

    tx.set(
      dailyRef,
      {
        fns: { [fn]: FieldValue.increment(1) },
        rate: { fns: { [fn]: verdict.fnWindow } },
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400_000),
      },
      { merge: true },
    )
  })
}
