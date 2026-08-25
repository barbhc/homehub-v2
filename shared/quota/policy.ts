/**
 * Spend-cap policy: what a call costs, what the ceilings are, and the rule for
 * whether a given call is allowed.
 *
 * Lives in shared/ and imports nothing from firebase so it can be unit-tested
 * by the root vitest run, the same way shared/parse/ssrf.ts is. The Firestore
 * transaction that applies this rule is in
 * firebase/functions/src/lib/quota.ts — it reads the counters and calls
 * decideQuota(), so the check and the increment cannot disagree about what
 * "over the limit" means.
 */
/**
 * Per user, per UTC day.
 *
 * Raised from 50 on 2026-08-25 at the owner's request. 50 was sized for a
 * homeowner adding an appliance now and then, and it made testing the app
 * impossible: a manual scan costs 10 units, so 50 was five scans a day BEFORE
 * anything else, and a real QA session spent most of it on the product lookups
 * that fire while you type. The account testing round 14 hit exactly 50/50 and
 * got two scans out of it.
 *
 * WHAT THIS NO LONGER PROTECTS: at 1000/day a single user can consume the
 * entire 20,000-unit monthly ceiling in twenty days, and that ceiling refuses
 * every paid call for EVERY user until the next UTC month. The daily cap has
 * stopped being a meaningful cost guard; the monthly ceiling and the per-minute
 * rate limits are what remain.
 */
export const DAILY_AI_LIMIT = 1000

/**
 * App-wide units per UTC month. Override with the AI_MONTHLY_UNIT_CEILING env
 * var (functions:config or a .env for the functions runtime).
 *
 * Sizing: a heavy household runs maybe 30-60 units/day, so 20k/month leaves
 * room for a real beta cohort while still stopping a runaway loop or a shared
 * link long before it becomes a four-figure invoice.
 */
export const DEFAULT_MONTHLY_UNIT_CEILING = 20_000

/**
 * What one call to each function costs, in units. 1 unit ~= one cheap Claude
 * call. Anything not listed costs 1.
 */
/**
 * A per-user, per-UTC-day cap on how many times ONE function may be called,
 * counted in CALLS rather than units.
 *
 * Owner, 2026-08-25: "I'd like to limit this per user certainly. I think it's
 * reasonable to limit someone to 50 scans a day."
 *
 * Why this is not just a smaller `DAILY_AI_LIMIT`: the shared pool is spent by
 * everything. Setting it to 500 to buy "50 scans" would deliver FEWER than 50,
 * because the product lookups that fire while you type, the OCR, and the
 * doc-type checks all come out of the same 500 — which is exactly how a 50-unit
 * day produced two scans. A scan cap has to count scans.
 *
 * This is also the cap that maps to money. A parse is the $0.55 item; the rest
 * are fractions of a cent. 50 scans/day is about $27 a day at the measured rate
 * — a real ceiling on the one call that can produce a four-figure invoice.
 */
export const AI_DAILY_CALL_LIMIT: Record<string, number> = {
  enqueueParse: 50, // ~$27/day at the measured $0.55 per manual
}

export const AI_UNIT_COST: Record<string, number> = {
  enqueueParse: 10, // a whole manual PDF, multi-pass, sometimes Opus
  ingestReference: 3,
  generateTasks: 3,
  classifyExistingTasks: 3, // batched over the caller's tasks
  ocr: 3, // Vision + a Claude cleanup pass
  detectDocType: 2, // first pages of a PDF
  identityResolve: 2, // several model + search calls per resolution
  importCareUrl: 2, // fetches a page, then summarises it
  chatQuery: 1,
  discussTask: 1,
  suggestCareNotes: 1,
  productLookup: 1,
  findManual: 1,
  searchProductImages: 1,
}

/** yyyy-mm-dd in UTC (quota day rolls at midnight UTC). */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** yyyy-mm in UTC (the ceiling's window). */
export function utcMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/** The per-day call cap for a function, or null when it has none. */
export function dailyCallLimitFor(fn: string): number | null {
  return AI_DAILY_CALL_LIMIT[fn] ?? null
}

export function unitCostFor(fn: string): number {
  return AI_UNIT_COST[fn] ?? 1
}

export function monthlyCeiling(): number {
  const raw = process.env.AI_MONTHLY_UNIT_CEILING
  if (!raw) return DEFAULT_MONTHLY_UNIT_CEILING
  // Strict: parseInt() would read "1e6" as 1, "50k" as 50 and "20,000" as 20 —
  // all plausible things to type into an env var, and all of which would
  // silently set a near-zero ceiling that blocks every call in the app.
  // Anything that is not a plain run of digits falls back to the default.
  const parsed = /^\d+$/.test(raw.trim()) ? Number.parseInt(raw.trim(), 10) : Number.NaN
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(
      `AI_MONTHLY_UNIT_CEILING is not a positive integer (got ${JSON.stringify(raw)}); ` +
        `falling back to ${DEFAULT_MONTHLY_UNIT_CEILING}`,
    )
    return DEFAULT_MONTHLY_UNIT_CEILING
  }
  return parsed
}

/**
 * The decision rule, pure and separately tested. Postgres-free and
 * Firestore-free on purpose: the transaction below reads the counters and
 * applies exactly this, so the check and the increment cannot disagree about
 * what "over the limit" means.
 */
export interface QuotaState {
  dailyUnits: number
  dailyLimit: number
  monthlyUnits: number
  monthlyCeiling: number
  units: number
  /** How many times this function has already run for this user today. */
  fnCallsToday?: number
  /** The per-function daily cap, if this function has one. */
  fnCallLimit?: number | null
}

export type QuotaVerdict =
  | { allowed: true }
  | { allowed: false; reason: "daily" | "global" | "invalid" | "fnDaily" }

export function decideQuota(s: QuotaState): QuotaVerdict {
  const all = [s.dailyUnits, s.dailyLimit, s.monthlyUnits, s.monthlyCeiling, s.units]
  if (all.some((n) => !Number.isInteger(n))) return { allowed: false, reason: "invalid" }
  if (s.units <= 0 || s.dailyLimit <= 0 || s.monthlyCeiling <= 0) {
    return { allowed: false, reason: "invalid" }
  }
  // A call that cannot fit under an empty ceiling is a bad cost table, not a
  // user who ran out. Surfacing it as "invalid" keeps it out of the user's lap.
  if (s.units > s.dailyLimit || s.units > s.monthlyCeiling) {
    return { allowed: false, reason: "invalid" }
  }
  // The per-FUNCTION cap is checked before the shared pool, because it is the
  // more specific and more useful thing to be told: "you have used today's
  // scans" beats "you have used today's allowance" when the allowance still has
  // room for everything else you might do.
  const fnLimit = s.fnCallLimit
  if (fnLimit != null) {
    if (!Number.isInteger(fnLimit) || fnLimit <= 0) return { allowed: false, reason: "invalid" }
    const used = s.fnCallsToday ?? 0
    if (!Number.isInteger(used) || used < 0) return { allowed: false, reason: "invalid" }
    if (used + 1 > fnLimit) return { allowed: false, reason: "fnDaily" }
  }
  // The caller's own limit is checked first: it is the one that resets
  // tomorrow rather than next month, so it is the more useful thing to be told.
  if (s.dailyUnits + s.units > s.dailyLimit) return { allowed: false, reason: "daily" }
  if (s.monthlyUnits + s.units > s.monthlyCeiling) return { allowed: false, reason: "global" }
  return { allowed: true }
}

// ─── Short-window rate limits ────────────────────────────────────────────────
//
// Quotas cap the month and the day. They do not cap the *second*, and that gap
// is the one a bug walks through: a client effect with a bad dependency array,
// a retry that never backs off, or a tester holding down a button can spend an
// entire 50-unit daily allowance in the time it takes to notice. By the time
// the daily cap stops it, the user is locked out for the rest of the day and
// the money is already spent — the cap worked and the user still lost.
//
// So there are two more counters, both per-user and both over a 60s window:
//
//   1. Per ENDPOINT. A stuck retry hammers one function; capping that function
//      alone stops it without touching anything else the user is doing.
//   2. An overall unit BURST cap. Ten different endpoints called five times
//      each is not caught by any per-endpoint limit, but it is still a loop.
//
// Deliberately a fixed window rather than a sliding log: one number and one
// timestamp per counter, read inside the transaction that was already reading
// the usage doc, so rate limiting costs zero extra Firestore round-trips. The
// known cost is boundary burst — a caller can spend a full window's budget at
// the end of one window and again at the start of the next, so the true
// worst case is 2x the stated limit over a 2s span. That is a factor of two,
// against the ~50x a real loop achieves unthrottled; a sliding window would buy
// the missing 2x for a second read and a much larger document.

/** How long a rate-limit window lasts. */
export const RATE_WINDOW_MS = 60_000

/** Calls per window per endpoint when the endpoint isn't listed below. */
export const DEFAULT_RATE_LIMIT = 10

/**
 * Calls allowed per 60s window, per user, PER ENDPOINT.
 *
 * Sized from what a human can actually do, not from what feels generous:
 * someone adds one appliance at a time and types a handful of chat messages a
 * minute. Anything above these numbers is a machine, and the whole point is to
 * stop the machine before it stops the person.
 */
export const AI_RATE_LIMIT: Record<string, number> = {
  enqueueParse: 2, // 10 units each; nobody photographs two manuals in a minute
  ingestReference: 3,
  classifyExistingTasks: 3, // already batched — calling it in a loop is a bug
  ocr: 5,
  detectDocType: 5,
  generateTasks: 5,
  importCareUrl: 5,
  identityResolve: 6,
  chatQuery: 10,
  discussTask: 10,
  suggestCareNotes: 10,
  productLookup: 10, // the add-item flow fires several of these back to back
  findManual: 10,
  searchProductImages: 10,
}

/**
 * Units per 60s window per user, summed across every endpoint.
 *
 * 25 is chosen against the most expensive LEGITIMATE minute in the app: adding
 * one appliance end-to-end is productLookup (1) + searchProductImages (1) +
 * findManual (1) + detectDocType (2) + enqueueParse (10) = 15 units, and a
 * person may reasonably retry a step. 25 clears that with room, while capping a
 * runaway at 25 units/min instead of the whole 50-unit day in five seconds.
 */
export const BURST_UNIT_LIMIT = 25

export function rateLimitFor(fn: string): number {
  return AI_RATE_LIMIT[fn] ?? DEFAULT_RATE_LIMIT
}

/** One fixed window: when it opened, and how much has been spent in it. */
export interface RateWindow {
  windowStart: number
  value: number
}

export interface RateState {
  /** Epoch ms. Injected rather than read here so the rule stays pure. */
  now: number
  /** This endpoint's window, as stored. */
  fnWindow: RateWindow
  /** Calls allowed for this endpoint per window. */
  fnLimit: number
  /** The all-endpoints unit window, as stored. */
  burstWindow: RateWindow
  /** Units allowed across all endpoints per window. */
  burstLimit: number
  /** What this call costs, in units. */
  units: number
}

export type RateVerdict =
  /** Allowed — and here is exactly what to persist, so the check and the write
   *  cannot disagree about what the window now contains. */
  | { allowed: true; fnWindow: RateWindow; burstWindow: RateWindow }
  | { allowed: false; reason: "endpoint" | "burst"; retryAfterSeconds: number }

/** Seconds until `window` rolls over, floored at 1 so we never say "retry in 0". */
function secondsUntilReset(now: number, window: RateWindow): number {
  const elapsed = now - window.windowStart
  return Math.max(1, Math.ceil((RATE_WINDOW_MS - elapsed) / 1000))
}

/**
 * Advance a fixed window to `now`, resetting it if the previous one expired.
 *
 * A windowStart in the FUTURE resets too. That is not paranoia: these values
 * come out of Firestore and are written by whichever function instance served
 * the last call, so a clock skew between instances could otherwise park a
 * window's start ahead of the present and lock the user out until real time
 * caught up.
 */
function advance(now: number, window: RateWindow): RateWindow {
  const fresh = window.windowStart <= now && now - window.windowStart < RATE_WINDOW_MS
  return fresh ? window : { windowStart: now, value: 0 }
}

/**
 * The rate-limit rule. Pure, and separately tested — same contract as
 * `decideQuota`: the transaction reads the counters, applies exactly this, and
 * writes back the windows this returns.
 *
 * Checked BEFORE the daily/monthly counters are incremented, so a call rejected
 * for going too fast costs the caller nothing. Being throttled must not also
 * spend the allowance being protected.
 */
export function decideRateLimit(s: RateState): RateVerdict {
  const nums = [s.now, s.fnLimit, s.burstLimit, s.units]
  if (nums.some((n) => !Number.isFinite(n))) {
    // Fail OPEN, unlike decideQuota's "invalid". A rate limiter is a guard on
    // top of the real spend caps, which still hold; refusing every call because
    // its own bookkeeping went bad would turn a limiter bug into an outage.
    return { allowed: true, fnWindow: { windowStart: s.now, value: 0 }, burstWindow: { windowStart: s.now, value: 0 } }
  }

  const fn = advance(s.now, s.fnWindow)
  const burst = advance(s.now, s.burstWindow)

  if (fn.value + 1 > s.fnLimit) {
    return { allowed: false, reason: "endpoint", retryAfterSeconds: secondsUntilReset(s.now, fn) }
  }
  if (burst.value + s.units > s.burstLimit) {
    return { allowed: false, reason: "burst", retryAfterSeconds: secondsUntilReset(s.now, burst) }
  }

  return {
    allowed: true,
    fnWindow: { windowStart: fn.windowStart, value: fn.value + 1 },
    burstWindow: { windowStart: burst.windowStart, value: burst.value + s.units },
  }
}
