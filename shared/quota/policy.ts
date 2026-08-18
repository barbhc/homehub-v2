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
export const DAILY_AI_LIMIT = 50

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
}

export type QuotaVerdict =
  | { allowed: true }
  | { allowed: false; reason: "daily" | "global" | "invalid" }

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
  // The caller's own limit is checked first: it is the one that resets
  // tomorrow rather than next month, so it is the more useful thing to be told.
  if (s.dailyUnits + s.units > s.dailyLimit) return { allowed: false, reason: "daily" }
  if (s.monthlyUnits + s.units > s.monthlyCeiling) return { allowed: false, reason: "global" }
  return { allowed: true }
}
