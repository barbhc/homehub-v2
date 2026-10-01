/**
 * Spend-cap policy: what a call costs, what the ceilings are, and the rule for
 * whether a given call is allowed.
 *
 * Lives in shared/ and imports nothing from firebase so it can be unit-tested
 * by the root vitest run, the same way shared/parse/ssrf.ts is. The Firestore
 * transaction that applies this rule is in
 * firebase/functions/src/lib/quota.ts — it reads the counters AND the
 * `config/spend` document and calls decideQuota(), so the check and the
 * increment cannot disagree about what "over the limit" means.
 *
 * ── Where the caps live (2026-09-30) ─────────────────────────────────────────
 *
 * In a server-only Firestore document, `config/spend`, read inside the same
 * transaction as every charge:
 *
 *   {
 *     monthlyCeilingUnits: number,                 // app-wide, per UTC month
 *     dailyUnitsDefault: number,                   // per user, per UTC day
 *     dailyUnitsOverrides: { [uid]: number },      // per-user exceptions
 *     scansPerDay: number,                         // per user, counted in CALLS
 *     parseCacheBreakpoint: boolean,               // prompt-cache the parse's PDF (default false)
 *     updatedAt: Timestamp,
 *   }
 *
 * `parseCacheBreakpoint` is not a cap: it is the one spend LEVER that lives
 * here, because it has to be switchable without a deploy. It is read by the
 * parse worker, not by the charge (parseWorker.ts, buildExtractionRequest).
 *
 * It replaced two constants and an env var. The env var was the documented
 * kill switch, and it did not work: gen-2 functions take env vars PER FUNCTION,
 * so "set AI_MONTHLY_UNIT_CEILING on any function" stopped one function and
 * left twenty paying. A document read by every charge stops all of them at
 * once, without a deploy: `monthlyCeilingUnits: 0` is the kill switch.
 *
 * Written only by `scripts/ops/set-spend-config.ts` (Admin SDK); firestore.rules
 * gives clients no read and no write, because the overrides map names uids.
 *
 * Absent document → DEFAULT_SPEND_CONFIG below. Precedence for the monthly
 * ceiling: the document (or the default), then AI_MONTHLY_UNIT_CEILING as an
 * EMERGENCY BRAKE that can only lower it — never raise it. A leftover env var
 * must never be able to override the kill switch upward.
 */

/**
 * The numbers the app runs on when `config/spend` does not exist.
 *
 * Sized against the Anthropic workspace hard limit rather than against usage
 * (audit 2026-09-29, Disagreement 2): the in-app ceiling should refuse with the
 * app's own calm message BEFORE the vendor starts rejecting calls with a raw
 * error. 1,500 units ≈ 150 manual scans ≈ $80 at the measured $0.55/scan — under
 * a $100 hard limit.
 *
 * 50 units per user per day is the tester allowance (Disagreement 11: the
 * 1,000/day of 2026-08-25 was raised for the OWNER's QA sessions, and she keeps
 * it via `dailyUnitsOverrides` — see scripts/ops/set-spend-config.ts). 50 is
 * one add-with-manual (~20 units) plus a handful of Ask questions.
 *
 * WHAT THIS MEANS FOR A RING: the monthly ceiling now binds before the daily
 * caps do. Ten testers at their 50-unit cap would spend 1,500 in three days.
 * That is deliberate — the ceiling is the money guard — and raising it is a
 * document write, not a deploy.
 */
export interface SpendConfig {
  monthlyCeilingUnits: number
  dailyUnitsDefault: number
  dailyUnitsOverrides: Record<string, number>
  scansPerDay: number
  /** Put a prompt-cache breakpoint on the manual PDF in the parse's Claude
   *  request. A cache write bills 1.25× input and a one-off parse never
   *  re-reads it, so this costs 25% more input per parse unless the same PDF
   *  goes to Claude again within five minutes (a retry, a rescan). Off by
   *  default; the owner turns it on to measure (docs/rollback.md §3). */
  parseCacheBreakpoint: boolean
}

export const DEFAULT_SPEND_CONFIG: Readonly<SpendConfig> = Object.freeze({
  monthlyCeilingUnits: 1500,
  dailyUnitsDefault: 50,
  dailyUnitsOverrides: Object.freeze({}) as Record<string, number>,
  // Owner, 2026-08-25: "I think it's reasonable to limit someone to 50 scans a
  // day." Counted in CALLS (see dailyCallLimitFor) — with the daily unit pool
  // now also at 50, the pool binds first for most users; the scan cap is what
  // still bounds an override account.
  scansPerDay: 50,
  parseCacheBreakpoint: false,
})

/** The code default for the per-user daily pool (config/spend absent). */
export const DEFAULT_DAILY_UNITS = DEFAULT_SPEND_CONFIG.dailyUnitsDefault

/** The code default for the app-wide monthly ceiling (config/spend absent). */
export const DEFAULT_MONTHLY_UNIT_CEILING = DEFAULT_SPEND_CONFIG.monthlyCeilingUnits

/**
 * What one call to each function costs, in units. 1 unit ~= one cheap Claude
 * call. Anything not listed costs 1.
 *
 * Units are per FUNCTION, not per model: a function that changes model keeps
 * its price unless the work it does changes size. (detectDocType moved to
 * Haiku 4.5 on 2026-09-30 and stays at 2 — at Haiku's price a whole-PDF
 * classification is roughly what 2 units were always meant to buy.)
 */
export const AI_UNIT_COST: Record<string, number> = {
  enqueueParse: 10, // a whole manual PDF, multi-pass, sometimes Opus
  ingestReference: 3,
  classifyExistingTasks: 3, // batched over the caller's tasks
  ocr: 3, // Vision + a Claude cleanup pass
  detectDocType: 2, // a whole PDF on Haiku 4.5
  identityResolve: 2, // several model + search calls per resolution
  chatQuery: 1, // the BASE price; each attached manual PDF adds CHAT_UNITS_PER_PDF
  discussTask: 1,
  proposeReminders: 1, // one haiku call over the home's task list
  productLookup: 1,
  // productLookup's brand-only mode: one Brave search from a model number.
  // Its own key so aiSpendGlobal shows whether that path ever fires.
  brandFromModel: 1,
  findManual: 1,
  searchProductImages: 1,
}

/**
 * Ask with the manual attached. When one or two manuals are in scope, chatQuery
 * sends each WHOLE PDF to Claude — ~100K input tokens, ≈ $0.20 per PDF on
 * Sonnet 5 — so a flat 1 unit priced an item-scoped question like a sentence.
 *
 * 5 units per attached PDF keeps a unit worth roughly the same money whatever
 * the call (a manual scan is 10 units ≈ $0.55; one PDF ≈ 5 units ≈ $0.20–0.30),
 * which is what makes the daily and monthly caps mean dollars.
 */
export const CHAT_UNITS_PER_PDF = 5

/** chatQuery attaches whole PDFs only when this many manuals or fewer are in
 *  scope; above it, it answers from parsed excerpts. */
export const CHAT_MAX_ATTACHED_PDFS = 2

/** What a chat turn costs with `attachedPdfs` manual PDFs attached. */
export function chatQueryUnits(attachedPdfs: number): number {
  const n = Number.isInteger(attachedPdfs) && attachedPdfs > 0 ? attachedPdfs : 0
  return unitCostFor("chatQuery") + CHAT_UNITS_PER_PDF * n
}

/** The most one call can ever cost. A daily limit or monthly ceiling below this
 *  cannot admit every call — the ops script warns about it. */
export const MAX_SINGLE_CALL_UNITS = Math.max(
  ...Object.values(AI_UNIT_COST),
  AI_UNIT_COST.chatQuery + CHAT_UNITS_PER_PDF * CHAT_MAX_ATTACHED_PDFS,
)

/**
 * Functions allowed to keep drawing on the SAME daily counter past the user's
 * limit, up to limit × multiplier.
 *
 * This replaced a per-call-site `limit` argument, which was a trap: findManual
 * passed 60 — meaning "60 searches a day" — and the transaction compared it with
 * the user's TOTAL units across every function, so findManual refused anyone
 * who had spent 60 units on anything (and, once the default fell to 50, would
 * have let findManual alone run past everyone's cap). A multiplier is relative
 * to whatever the user's limit is, so it cannot drift when the limit changes.
 *
 * productLookup fires on typing pauses (~$0.001 each, cache hits charged too);
 * 3× keeps it from being the thing that starves a real add session.
 */
export const DAILY_POOL_MULTIPLIER: Record<string, number> = {
  productLookup: 3,
}

/** yyyy-mm-dd in UTC (quota day rolls at midnight UTC). */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** yyyy-mm in UTC (the ceiling's window). */
export function utcMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/**
 * The per-day CALL cap for a function, or null when it has none.
 *
 * Why the scan cap is not just a smaller daily pool: the pool is spent by
 * everything, so "50 scans" as units would deliver fewer than 50 — the lookups,
 * OCR and doc-type checks come out of the same pool. A scan cap has to count
 * scans.
 */
export function dailyCallLimitFor(fn: string, config: SpendConfig = DEFAULT_SPEND_CONFIG): number | null {
  return fn === "enqueueParse" ? config.scansPerDay : null
}

export function unitCostFor(fn: string): number {
  return AI_UNIT_COST[fn] ?? 1
}

/**
 * The daily unit limit `uid` is held to when calling `fn`: their override, or
 * the default, times the function's pool multiplier.
 */
export function dailyLimitFor(config: SpendConfig, uid: string, fn: string): number {
  const own = Object.prototype.hasOwnProperty.call(config.dailyUnitsOverrides, uid)
    ? config.dailyUnitsOverrides[uid]
    : config.dailyUnitsDefault
  return own * (DAILY_POOL_MULTIPLIER[fn] ?? 1)
}

/**
 * AI_MONTHLY_UNIT_CEILING, when it is set to a usable number — else null.
 *
 * Strict: parseInt() would read "1e6" as 1, "50k" as 50 and "20,000" as 20 —
 * all plausible things to type into an env var. Anything that is not a plain
 * run of digits, or is 0, is ignored (and logged): the env var is an emergency
 * brake, and the kill switch is `monthlyCeilingUnits: 0` in config/spend.
 */
export function envMonthlyCeiling(raw: string | undefined = process.env.AI_MONTHLY_UNIT_CEILING): number | null {
  if (!raw) return null
  const parsed = /^\d+$/.test(raw.trim()) ? Number.parseInt(raw.trim(), 10) : Number.NaN
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`AI_MONTHLY_UNIT_CEILING is not a positive integer (got ${JSON.stringify(raw)}); ignoring it`)
    return null
  }
  return parsed
}

/**
 * The ceiling a charge is held to: the config's, lowered — never raised — by
 * the env brake.
 */
export function effectiveMonthlyCeiling(config: SpendConfig, envCeiling: number | null = envMonthlyCeiling()): number {
  return envCeiling === null ? config.monthlyCeilingUnits : Math.min(config.monthlyCeilingUnits, envCeiling)
}

/** A usable config number: a non-negative safe integer. 0 is meaningful (a
 *  stopped ceiling, a blocked user), so it is allowed. */
function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0
}

/**
 * Read a `config/spend` document into a SpendConfig, and say what was wrong
 * with it. Never throws: the caller is a charge in progress.
 *
 * The failure directions are chosen per field, on purpose:
 *  - `monthlyCeilingUnits` present but unusable → 0. That field is the kill
 *    switch; someone who typed `"0"` (a string) into the console meant STOP,
 *    and a guard that quietly fell back to 1,500 would be a kill switch that
 *    does not kill. Refusing every paid call until the typo is fixed is the
 *    safe direction for a money guard, and the refusal is logged loudly.
 *  - the per-user numbers fall back to the code defaults: the monthly ceiling
 *    still bounds the money while the typo stands.
 *  - `parseCacheBreakpoint` anything but `true`/`false` → false: off is the
 *    request every parse sent before the switch existed.
 *  - absent fields take the defaults silently — an absent document is the
 *    normal state before the ops script has ever run.
 */
export function parseSpendConfig(raw: unknown): { config: SpendConfig; problems: string[] } {
  const problems: string[] = []
  if (raw === undefined || raw === null) {
    return { config: { ...DEFAULT_SPEND_CONFIG, dailyUnitsOverrides: {} }, problems }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    problems.push("config/spend is not an object — treating monthlyCeilingUnits as 0 until it is fixed")
    return { config: { ...DEFAULT_SPEND_CONFIG, dailyUnitsOverrides: {}, monthlyCeilingUnits: 0 }, problems }
  }
  const r = raw as Record<string, unknown>

  let monthlyCeilingUnits = DEFAULT_SPEND_CONFIG.monthlyCeilingUnits
  if (r.monthlyCeilingUnits !== undefined) {
    if (isCount(r.monthlyCeilingUnits)) monthlyCeilingUnits = r.monthlyCeilingUnits
    else {
      monthlyCeilingUnits = 0
      problems.push(
        `config/spend.monthlyCeilingUnits is not a non-negative integer (got ${JSON.stringify(r.monthlyCeilingUnits)}) — treating it as 0`,
      )
    }
  }

  const count = (key: "dailyUnitsDefault" | "scansPerDay"): number => {
    const v = r[key]
    if (v === undefined) return DEFAULT_SPEND_CONFIG[key]
    if (isCount(v)) return v
    problems.push(`config/spend.${key} is not a non-negative integer (got ${JSON.stringify(v)}) — using ${DEFAULT_SPEND_CONFIG[key]}`)
    return DEFAULT_SPEND_CONFIG[key]
  }

  const dailyUnitsOverrides: Record<string, number> = {}
  if (r.dailyUnitsOverrides !== undefined) {
    const o = r.dailyUnitsOverrides
    if (!o || typeof o !== "object" || Array.isArray(o)) {
      problems.push("config/spend.dailyUnitsOverrides is not a map of uid → units — ignoring it")
    } else {
      for (const [uid, units] of Object.entries(o as Record<string, unknown>)) {
        if (isCount(units)) dailyUnitsOverrides[uid] = units
        else problems.push(`config/spend.dailyUnitsOverrides.${uid} is not a non-negative integer — ignoring it`)
      }
    }
  }

  let parseCacheBreakpoint = DEFAULT_SPEND_CONFIG.parseCacheBreakpoint
  if (r.parseCacheBreakpoint !== undefined) {
    if (typeof r.parseCacheBreakpoint === "boolean") parseCacheBreakpoint = r.parseCacheBreakpoint
    else problems.push(`config/spend.parseCacheBreakpoint is not true or false (got ${JSON.stringify(r.parseCacheBreakpoint)}) — leaving it off`)
  }

  return {
    config: {
      monthlyCeilingUnits,
      dailyUnitsDefault: count("dailyUnitsDefault"),
      dailyUnitsOverrides,
      scansPerDay: count("scansPerDay"),
      parseCacheBreakpoint,
    },
    problems,
  }
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
  // A call that costs nothing would be free AND uncapped — a bad cost table,
  // not a user who ran out. Negative limits are corrupt data. Both stay out of
  // the user's lap as "invalid".
  if (s.units <= 0 || s.dailyLimit < 0 || s.monthlyCeiling < 0) {
    return { allowed: false, reason: "invalid" }
  }
  // A ceiling of 0 is the KILL SWITCH (config/spend.monthlyCeilingUnits: 0),
  // and it must read as the app's budget — the calm refusal that parks a scan
  // and says it was not the user's doing. Until 2026-09-30 a 0 ceiling was
  // "invalid" ("Usage accounting is misconfigured"), which is why the runbook
  // had to say "never set it below 20". Checked first: when the switch is
  // thrown, nothing else about this caller matters.
  if (s.monthlyCeiling === 0) return { allowed: false, reason: "global" }
  // The per-FUNCTION cap is checked before the shared pool, because it is the
  // more specific and more useful thing to be told: "you have used today's
  // scans" beats "you have used today's allowance" when the allowance still has
  // room for everything else you might do. A cap of 0 is config ("no scans
  // today"), not corruption.
  const fnLimit = s.fnCallLimit
  if (fnLimit != null) {
    if (!Number.isInteger(fnLimit) || fnLimit < 0) return { allowed: false, reason: "invalid" }
    const used = s.fnCallsToday ?? 0
    if (!Number.isInteger(used) || used < 0) return { allowed: false, reason: "invalid" }
    if (used + 1 > fnLimit) return { allowed: false, reason: "fnDaily" }
  }
  // The caller's own limit next: it is the one that resets tomorrow rather
  // than next month, so it is the more useful thing to be told. A limit of 0
  // (a blocked account) and a call bigger than the whole limit both land here —
  // limits are config now, set per user, so "this call does not fit your day"
  // is the honest answer, not "the cost table is broken".
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
  identityResolve: 6,
  chatQuery: 10,
  discussTask: 10,
  productLookup: 10, // the add-item flow fires several of these back to back
  brandFromModel: 10, // same budget as the other Brave calls
  findManual: 10,
  searchProductImages: 10,
  // Not an AI call — egress. The manual viewer loads a PDF once per open, so
  // ten a minute is a person opening ten different manuals.
  proxyPdf: 10,
}

/**
 * Per-user, per-UTC-day CALL caps for endpoints that spend no AI units but do
 * spend money (enforced by `enforceCallLimits` in lib/quota.ts, not by the unit
 * pool).
 *
 * proxyPdf relays up to 50 MB per call out of Cloud Functions; the per-minute
 * limit alone would still allow ~14,000 calls a day. 100 manual opens a day is
 * far past what a person does (each PDF is cached in the viewer and by the
 * browser for a day), and bounds one account's egress at ~5 GB/day.
 */
export const DAILY_CALL_CAP: Record<string, number> = {
  proxyPdf: 100,
}

/**
 * Units per 60s window per user, summed across every endpoint.
 *
 * Sized against the most expensive LEGITIMATE minute in the app, and re-sized
 * on 2026-08-28 after a tester hit it doing nothing unusual (HH-145).
 *
 * Adding one appliance end-to-end, as the flow actually stands:
 *
 *     ocr                    3   scanning the label
 *     detectDocType          2
 *     enqueueParse          10
 *     productLookup          1   identity, from the add screen
 *     productLookup          1   post-create enrichment (added 2026-08-28)
 *     productLookup          1   brand-from-model, when a scan reads one and
 *                                not the other (added 2026-08-28)
 *     findManual             1
 *     searchProductImages    1
 *                          ───
 *                           20
 *
 * The old comment sized this against 15 and the flow has since grown past it —
 * two of those lookups landed the same day the report came in. At 25 a single
 * add left 5 units of headroom, so a second appliance in the same minute, or
 * one re-scan of a label, was refused. That is a person using the app the way
 * onboarding invites them to, not a runaway.
 *
 * (2026-09-30: the third lookup — brand-from-model — is now charged under its
 * own key, `brandFromModel`, at the same 1 unit. The total is unchanged.)
 *
 * 45 covers two full adds (40) with room for a retry, and still stops the case
 * this exists for: a loop burning a day's allowance in seconds. With the
 * default pool at 50 units a runaway meets the daily cap within about a
 * minute; for an override account (the owner's 1,000/day) the burst cap is
 * what keeps that from taking five seconds instead of ~22 minutes.
 *
 * Raising it is a spend decision, so the arithmetic is here rather than in a
 * commit message: what bounds cost is the per-user daily pool and the monthly
 * ceiling in config/spend.
 */
export const BURST_UNIT_LIMIT = 45

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
