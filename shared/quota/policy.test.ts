import { describe, it, expect, afterEach, vi } from "vitest"
import {
  AI_UNIT_COST,
  BURST_UNIT_LIMIT,
  CHAT_MAX_ATTACHED_PDFS,
  CHAT_UNITS_PER_PDF,
  DAILY_CALL_CAP,
  DAILY_POOL_MULTIPLIER,
  DEFAULT_DAILY_UNITS,
  DEFAULT_MONTHLY_UNIT_CEILING,
  DEFAULT_RATE_LIMIT,
  DEFAULT_SPEND_CONFIG,
  MAX_SINGLE_CALL_UNITS,
  RATE_WINDOW_MS,
  chatQueryUnits,
  dailyCallLimitFor,
  dailyLimitFor,
  decideQuota,
  decideRateLimit,
  effectiveMonthlyCeiling,
  envMonthlyCeiling,
  parseSpendConfig,
  rateLimitFor,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
  type SpendConfig,
} from "./policy.js"

const base = {
  dailyUnits: 0,
  dailyLimit: 10,
  monthlyUnits: 0,
  monthlyCeiling: 1000,
  units: 1,
}

/**
 * This list is the flow AS IT ACTUALLY RUNS, and keeping it that way is the
 * point of the tests that use it. It previously omitted `ocr` and two later
 * productLookup calls, so it kept passing while the real add grew past the
 * limit — and a tester was refused mid-onboarding with "The scan failed"
 * (HH-145). A budget test measuring a flow the app no longer has is worse than
 * none: it reports headroom that does not exist.
 */
const ADD_ONE_APPLIANCE = [
  "ocr",                 // scanning the label
  "detectDocType",
  "enqueueParse",
  "productLookup",       // identity, from the add screen
  "productLookup",       // post-create enrichment
  "brandFromModel",      // brand-from-model, when the scan reads one and not the other
  "findManual",
  "searchProductImages",
]
const costOf = (fns: string[]) => fns.reduce((n, fn) => n + unitCostFor(fn), 0)

const config = (patch: Partial<SpendConfig> = {}): SpendConfig => ({
  ...DEFAULT_SPEND_CONFIG,
  dailyUnitsOverrides: {},
  ...patch,
})

describe("decideQuota", () => {
  it("allows a call that fits under both ceilings", () => {
    expect(decideQuota(base)).toEqual({ allowed: true })
  })

  it("allows the call that lands exactly on the daily limit", () => {
    expect(decideQuota({ ...base, dailyUnits: 9 })).toEqual({ allowed: true })
  })

  it("denies the call that would cross it", () => {
    expect(decideQuota({ ...base, dailyUnits: 10 })).toEqual({ allowed: false, reason: "daily" })
  })

  it("denies a multi-unit call that overshoots where a 1-unit call would fit", () => {
    expect(decideQuota({ ...base, dailyUnits: 8, units: 3 })).toEqual({
      allowed: false,
      reason: "daily",
    })
    expect(decideQuota({ ...base, dailyUnits: 8, units: 2 })).toEqual({ allowed: true })
  })

  it("reports the user's own limit first when both are blown", () => {
    // The daily one resets tomorrow; telling someone about the monthly ceiling
    // when their own cap is also full would be the less useful truth.
    expect(decideQuota({ ...base, dailyUnits: 10, monthlyUnits: 1000 })).toEqual({
      allowed: false,
      reason: "daily",
    })
  })

  it("denies on the app-wide ceiling when the caller still has room", () => {
    // The gap this whole change exists to close: per-user caps do not add up
    // to a spend cap when anyone can sign up.
    expect(decideQuota({ ...base, monthlyUnits: 1000 })).toEqual({
      allowed: false,
      reason: "global",
    })
  })

  it("allows the call that lands exactly on the monthly ceiling", () => {
    expect(decideQuota({ ...base, monthlyUnits: 999 })).toEqual({ allowed: true })
  })

  it("a call bigger than the user's whole day is 'daily' — limits are per-user config now", () => {
    // Was "invalid" ("Usage accounting is misconfigured") when the limit was one
    // constant for everyone. With config/spend setting it per user, a small
    // limit is a policy, and the honest answer is "this does not fit your day".
    expect(decideQuota({ ...base, dailyLimit: 5, units: 10 })).toEqual({ allowed: false, reason: "daily" })
  })

  it("a call bigger than the whole month is 'global', not a crash", () => {
    expect(decideQuota({ ...base, monthlyCeiling: 5, units: 10, dailyLimit: 50 })).toEqual({
      allowed: false,
      reason: "global",
    })
  })

  describe("the kill switch (config/spend.monthlyCeilingUnits: 0)", () => {
    it("refuses as the app's budget — the calm refusal that parks a scan", () => {
      // It used to be "invalid" ("Usage accounting is misconfigured"), which is
      // why the old runbook warned never to set the ceiling below 20.
      expect(decideQuota({ ...base, monthlyCeiling: 0 })).toEqual({ allowed: false, reason: "global" })
    })

    it("wins over everything else about the caller", () => {
      expect(decideQuota({ ...base, monthlyCeiling: 0, dailyUnits: 10 })).toEqual({ allowed: false, reason: "global" })
      expect(decideQuota({ ...base, monthlyCeiling: 0, fnCallsToday: 99, fnCallLimit: 1 })).toEqual({
        allowed: false,
        reason: "global",
      })
    })
  })

  it("a blocked account (daily limit 0) is refused as 'daily', not as a crash", () => {
    expect(decideQuota({ ...base, dailyLimit: 0 })).toEqual({ allowed: false, reason: "daily" })
  })

  it.each([
    ["zero units", { units: 0 }],
    ["negative units", { units: -1 }],
    ["fractional units", { units: 1.5 }],
    ["negative daily limit", { dailyLimit: -1 }],
    ["negative ceiling", { monthlyCeiling: -1 }],
    ["NaN counter", { dailyUnits: Number.NaN }],
    ["Infinity ceiling", { monthlyCeiling: Number.POSITIVE_INFINITY }],
  ])("rejects %s as invalid", (_label, patch) => {
    expect(decideQuota({ ...base, ...patch })).toEqual({ allowed: false, reason: "invalid" })
  })
})

describe("cost table", () => {
  it("prices a whole-PDF parse above a chat turn", () => {
    // The reason units exist at all.
    expect(AI_UNIT_COST.enqueueParse).toBeGreaterThan(AI_UNIT_COST.chatQuery)
  })

  it("defaults an unlisted function to 1 rather than 0", () => {
    // A 0 would make the call free and un-capped, which is the failure mode
    // this table is meant to prevent.
    expect(unitCostFor("somethingNobodyAddedYet")).toBe(1)
    expect(unitCostFor("chatQuery")).toBe(1)
    expect(unitCostFor("enqueueParse")).toBe(10)
  })

  it("keeps every function callable at least once on the default day", () => {
    for (const [fn, cost] of Object.entries(AI_UNIT_COST)) {
      expect(
        decideQuota({ ...base, dailyLimit: DEFAULT_DAILY_UNITS, units: cost }),
        `${fn} costs ${cost}, above the default daily pool`,
      ).toEqual({ allowed: true })
    }
    // …including the dearest call there is: an Ask turn with both manuals attached.
    expect(decideQuota({ ...base, dailyLimit: DEFAULT_DAILY_UNITS, units: MAX_SINGLE_CALL_UNITS })).toEqual({
      allowed: true,
    })
  })

  it("keeps every cost well under the monthly ceiling", () => {
    for (const cost of Object.values(AI_UNIT_COST)) {
      expect(cost).toBeLessThan(DEFAULT_MONTHLY_UNIT_CEILING)
    }
  })
})

describe("Ask pays for the manuals it attaches (C4)", () => {
  it("a question with no PDF costs the base unit", () => {
    expect(chatQueryUnits(0)).toBe(1)
  })

  it("each attached PDF adds CHAT_UNITS_PER_PDF", () => {
    expect(CHAT_UNITS_PER_PDF).toBe(5)
    expect(chatQueryUnits(1)).toBe(6)
    expect(chatQueryUnits(2)).toBe(11)
  })

  it("junk counts cost the base unit, never less", () => {
    expect(chatQueryUnits(-3)).toBe(1)
    expect(chatQueryUnits(1.5)).toBe(1)
    expect(chatQueryUnits(Number.NaN)).toBe(1)
  })

  it("the dearest call in the app is an Ask turn with the most PDFs chat will attach", () => {
    expect(MAX_SINGLE_CALL_UNITS).toBe(chatQueryUnits(CHAT_MAX_ATTACHED_PDFS))
    expect(MAX_SINGLE_CALL_UNITS).toBeGreaterThanOrEqual(AI_UNIT_COST.enqueueParse)
  })

  it("a full-PDF Ask turn still fits the burst window, so a person asking is never throttled for it", () => {
    expect(MAX_SINGLE_CALL_UNITS).toBeLessThanOrEqual(BURST_UNIT_LIMIT)
  })
})

describe("config/spend → the numbers a charge uses (C5)", () => {
  it("an absent document is the code defaults, with nothing to report", () => {
    const { config: c, problems } = parseSpendConfig(undefined)
    expect(c).toEqual({ monthlyCeilingUnits: 1500, dailyUnitsDefault: 50, dailyUnitsOverrides: {}, scansPerDay: 50 })
    expect(problems).toEqual([])
    expect(parseSpendConfig(null).problems).toEqual([])
  })

  it("the owner's defaults are the numbers the plan set", () => {
    expect(DEFAULT_MONTHLY_UNIT_CEILING).toBe(1500)
    expect(DEFAULT_DAILY_UNITS).toBe(50)
    expect(DEFAULT_SPEND_CONFIG.scansPerDay).toBe(50)
  })

  it("reads a complete, valid document as written", () => {
    const { config: c, problems } = parseSpendConfig({
      monthlyCeilingUnits: 3000,
      dailyUnitsDefault: 40,
      dailyUnitsOverrides: { ownerUid: 1000 },
      scansPerDay: 20,
      updatedAt: new Date(),
    })
    expect(c).toEqual({ monthlyCeilingUnits: 3000, dailyUnitsDefault: 40, dailyUnitsOverrides: { ownerUid: 1000 }, scansPerDay: 20 })
    expect(problems).toEqual([])
  })

  it("0 is a real value for every number (kill switch, blocked day, no scans)", () => {
    const { config: c, problems } = parseSpendConfig({ monthlyCeilingUnits: 0, dailyUnitsDefault: 0, scansPerDay: 0 })
    expect(c.monthlyCeilingUnits).toBe(0)
    expect(c.dailyUnitsDefault).toBe(0)
    expect(c.scansPerDay).toBe(0)
    expect(problems).toEqual([])
  })

  it.each([["the string \"0\"", "0"], ["a fraction", 12.5], ["a negative", -1], ["null", null], ["an object", { units: 0 }]])(
    "a malformed ceiling (%s) FAILS CLOSED — a kill switch typed wrong must still kill",
    (_label, bad) => {
      const { config: c, problems } = parseSpendConfig({ monthlyCeilingUnits: bad })
      expect(c.monthlyCeilingUnits).toBe(0)
      expect(problems.join(" ")).toMatch(/monthlyCeilingUnits/)
    },
  )

  it("malformed per-user numbers fall back to the defaults, and say so", () => {
    const { config: c, problems } = parseSpendConfig({ dailyUnitsDefault: "lots", scansPerDay: -2 })
    expect(c.dailyUnitsDefault).toBe(DEFAULT_DAILY_UNITS)
    expect(c.scansPerDay).toBe(DEFAULT_SPEND_CONFIG.scansPerDay)
    expect(problems).toHaveLength(2)
  })

  it("drops a bad override entry and keeps the good ones", () => {
    const { config: c, problems } = parseSpendConfig({ dailyUnitsOverrides: { good: 1000, bad: "1000", worse: -5 } })
    expect(c.dailyUnitsOverrides).toEqual({ good: 1000 })
    expect(problems).toHaveLength(2)
  })

  it("an override map that is not a map is ignored, not trusted", () => {
    expect(parseSpendConfig({ dailyUnitsOverrides: [1000] }).config.dailyUnitsOverrides).toEqual({})
    expect(parseSpendConfig({ dailyUnitsOverrides: "owner:1000" }).problems).toHaveLength(1)
  })

  it("a document that is not an object fails closed", () => {
    const { config: c, problems } = parseSpendConfig("stop")
    expect(c.monthlyCeilingUnits).toBe(0)
    expect(problems).toHaveLength(1)
  })

  it("never shares the frozen defaults with a caller", () => {
    const { config: c } = parseSpendConfig(undefined)
    c.dailyUnitsOverrides.someone = 5
    expect(DEFAULT_SPEND_CONFIG.dailyUnitsOverrides).toEqual({})
  })
})

describe("whose limit is it (dailyLimitFor)", () => {
  it("the default, for everyone without an override", () => {
    expect(dailyLimitFor(config(), "tester", "chatQuery")).toBe(50)
  })

  it("an override wins for its own uid only — the owner's 1,000/day", () => {
    const c = config({ dailyUnitsOverrides: { owner: 1000 } })
    expect(dailyLimitFor(c, "owner", "chatQuery")).toBe(1000)
    expect(dailyLimitFor(c, "tester", "chatQuery")).toBe(50)
  })

  it("an override of 0 blocks that account", () => {
    expect(dailyLimitFor(config({ dailyUnitsOverrides: { abuser: 0 } }), "abuser", "ocr")).toBe(0)
  })

  it("productLookup's extra headroom is RELATIVE to the user's own limit (the findManual trap, C6)", () => {
    // A literal passed from the call site silently changes meaning when the
    // limit it is compared with moves. A multiplier cannot.
    expect(DAILY_POOL_MULTIPLIER.productLookup).toBe(3)
    expect(dailyLimitFor(config(), "tester", "productLookup")).toBe(150)
    expect(dailyLimitFor(config({ dailyUnitsOverrides: { owner: 1000 } }), "owner", "productLookup")).toBe(3000)
  })

  it("findManual has NO private allowance — it draws on the same pool as everything else", () => {
    expect(DAILY_POOL_MULTIPLIER.findManual).toBeUndefined()
    expect(dailyLimitFor(config(), "tester", "findManual")).toBe(dailyLimitFor(config(), "tester", "chatQuery"))
  })

  it("a uid that collides with an Object.prototype name is not an override", () => {
    expect(dailyLimitFor(config(), "constructor", "chatQuery")).toBe(50)
    expect(dailyLimitFor(config(), "__proto__", "chatQuery")).toBe(50)
  })
})

describe("the monthly ceiling: config first, env var only as a brake", () => {
  const original = process.env.AI_MONTHLY_UNIT_CEILING
  afterEach(() => {
    if (original === undefined) delete process.env.AI_MONTHLY_UNIT_CEILING
    else process.env.AI_MONTHLY_UNIT_CEILING = original
  })

  it("unset env → the config's ceiling", () => {
    delete process.env.AI_MONTHLY_UNIT_CEILING
    expect(envMonthlyCeiling()).toBeNull()
    expect(effectiveMonthlyCeiling(config())).toBe(1500)
  })

  it("a valid env value can LOWER the ceiling", () => {
    process.env.AI_MONTHLY_UNIT_CEILING = "1234"
    expect(envMonthlyCeiling()).toBe(1234)
    expect(effectiveMonthlyCeiling(config())).toBe(1234)
  })

  it("but can never RAISE it — a leftover env var must not out-vote the document", () => {
    process.env.AI_MONTHLY_UNIT_CEILING = "20000"
    expect(effectiveMonthlyCeiling(config())).toBe(1500)
  })

  it("and can never lift the kill switch", () => {
    process.env.AI_MONTHLY_UNIT_CEILING = "20000"
    expect(effectiveMonthlyCeiling(config({ monthlyCeilingUnits: 0 }))).toBe(0)
  })

  it.each(["0", "-5", "banana", "1e6", "", "20,000"])("ignores an unusable env value (%s) rather than guessing", (bad) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    process.env.AI_MONTHLY_UNIT_CEILING = bad
    expect(envMonthlyCeiling()).toBeNull()
    expect(effectiveMonthlyCeiling(config())).toBe(1500)
    vi.restoreAllMocks()
  })
})

describe("window keys", () => {
  it("keys the day in UTC, not local time", () => {
    expect(utcDayKey(new Date("2026-08-18T23:59:59Z"))).toBe("2026-08-18")
    expect(utcDayKey(new Date("2026-08-19T00:00:00Z"))).toBe("2026-08-19")
  })

  it("keys the month in UTC", () => {
    expect(utcMonthKey(new Date("2026-08-31T23:59:59Z"))).toBe("2026-08")
    expect(utcMonthKey(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09")
  })
})

describe("decideRateLimit", () => {
  const T0 = 1_700_000_000_000
  const base = {
    now: T0,
    fnWindow: { windowStart: T0, value: 0 },
    fnLimit: 3,
    burstWindow: { windowStart: T0, value: 0 },
    burstLimit: 25,
    units: 1,
  }

  it("allows a call in a fresh window and reports the windows to persist", () => {
    expect(decideRateLimit(base)).toEqual({
      allowed: true,
      fnWindow: { windowStart: T0, value: 1 },
      burstWindow: { windowStart: T0, value: 1 },
    })
  })

  it("allows the call that lands exactly on the endpoint limit", () => {
    const v = decideRateLimit({ ...base, fnWindow: { windowStart: T0, value: 2 } })
    expect(v.allowed).toBe(true)
  })

  it("denies the call that would cross it, and says how long to wait", () => {
    // 20s into a 60s window → 40s left.
    const v = decideRateLimit({
      ...base,
      now: T0 + 20_000,
      fnWindow: { windowStart: T0, value: 3 },
    })
    expect(v).toEqual({ allowed: false, reason: "endpoint", retryAfterSeconds: 40 })
  })

  it("reopens the window once it has expired", () => {
    // Same exhausted counter, one millisecond past the window: allowed, and the
    // window restarts at 1 rather than continuing from 3.
    expect(
      decideRateLimit({ ...base, now: T0 + RATE_WINDOW_MS, fnWindow: { windowStart: T0, value: 3 } }),
    ).toEqual({
      allowed: true,
      fnWindow: { windowStart: T0 + RATE_WINDOW_MS, value: 1 },
      burstWindow: { windowStart: T0 + RATE_WINDOW_MS, value: 1 },
    })
  })

  it("catches a loop that spreads itself across many endpoints", () => {
    // The gap a per-endpoint limit alone cannot see: every endpoint is under
    // its own cap, and the user is still burning units in a tight loop.
    expect(decideRateLimit({ ...base, burstWindow: { windowStart: T0, value: 25 } })).toEqual({
      allowed: false,
      reason: "burst",
      retryAfterSeconds: 60,
    })
  })

  it("charges the burst window in units, so one parse is not one chat turn", () => {
    // 10-unit parse against 20 already spent: over 25, denied. The same call
    // costed as 1 would have been waved through.
    const v = decideRateLimit({ ...base, units: 10, burstWindow: { windowStart: T0, value: 20 } })
    expect(v).toEqual({ allowed: false, reason: "burst", retryAfterSeconds: 60 })
  })

  it("checks the endpoint before the burst — the more actionable of the two", () => {
    const v = decideRateLimit({
      ...base,
      fnWindow: { windowStart: T0, value: 3 },
      burstWindow: { windowStart: T0, value: 25 },
    })
    expect(v).toMatchObject({ allowed: false, reason: "endpoint" })
  })

  it("never tells a caller to retry in zero seconds", () => {
    // Last millisecond of the window: ceil() would give 1, but a floor guards
    // the case where clock skew puts `now` past windowStart + RATE_WINDOW_MS
    // while the window still reads as fresh.
    const v = decideRateLimit({
      ...base,
      now: T0 + RATE_WINDOW_MS - 1,
      fnWindow: { windowStart: T0, value: 3 },
    })
    expect(v).toMatchObject({ allowed: false, retryAfterSeconds: 1 })
  })

  it("resets a window whose start is in the future rather than locking the user out", () => {
    // Two function instances with skewed clocks; the earlier one wrote a
    // windowStart ahead of this instance's `now`. Without the guard the user
    // would be throttled until real time caught up.
    expect(
      decideRateLimit({ ...base, fnWindow: { windowStart: T0 + 5 * RATE_WINDOW_MS, value: 99 } }),
    ).toMatchObject({ allowed: true })
  })

  it("fails OPEN on unusable input", () => {
    // Opposite of decideQuota's "invalid", and deliberately so: the daily and
    // monthly caps still hold underneath, so a limiter bug must not become an
    // app-wide outage.
    expect(decideRateLimit({ ...base, now: Number.NaN })).toMatchObject({ allowed: true })
    expect(decideRateLimit({ ...base, fnLimit: Number.POSITIVE_INFINITY })).toMatchObject({
      allowed: true,
    })
  })

  it("a zero-unit call (proxyPdf's egress) is limited per endpoint and never touches the burst", () => {
    const v = decideRateLimit({ ...base, units: 0, burstWindow: { windowStart: T0, value: 25 } })
    expect(v).toMatchObject({ allowed: true })
    expect(decideRateLimit({ ...base, units: 0, fnWindow: { windowStart: T0, value: 3 } })).toMatchObject({
      allowed: false,
      reason: "endpoint",
    })
  })
})

describe("rate-limit table", () => {
  it("prices the parse endpoint tightest — it is the expensive one", () => {
    expect(rateLimitFor("enqueueParse")).toBeLessThan(rateLimitFor("chatQuery"))
  })

  it("defaults an unlisted endpoint to a real limit rather than unlimited", () => {
    expect(rateLimitFor("somethingNobodyAddedYet")).toBe(DEFAULT_RATE_LIMIT)
    expect(Number.isFinite(rateLimitFor("somethingNobodyAddedYet"))).toBe(true)
  })

  it("lets the most expensive legitimate minute through", () => {
    expect(costOf(ADD_ONE_APPLIANCE)).toBeLessThanOrEqual(BURST_UNIT_LIMIT)
  })

  it("lets someone add TWO appliances in a minute — the case that broke", () => {
    // Onboarding actively invites this: a new tester adds a couple of things
    // back to back. Being throttled for it is indistinguishable from a bug.
    expect(costOf([...ADD_ONE_APPLIANCE, ...ADD_ONE_APPLIANCE])).toBeLessThanOrEqual(BURST_UNIT_LIMIT)
  })

  it("still refuses a runaway — the limit is not simply large", () => {
    // Four adds in one minute is not a person. If this ever passes, the burst
    // limit has stopped being a limit.
    const four = [...ADD_ONE_APPLIANCE, ...ADD_ONE_APPLIANCE, ...ADD_ONE_APPLIANCE, ...ADD_ONE_APPLIANCE]
    expect(costOf(four)).toBeGreaterThan(BURST_UNIT_LIMIT)
  })

  it("stops a runaway well short of the whole daily allowance in one window", () => {
    // The stated purpose: a stuck retry must not spend the day in five seconds.
    expect(BURST_UNIT_LIMIT).toBeLessThan(DEFAULT_DAILY_UNITS)
  })

  it("keeps every priced endpoint callable at least once per window", () => {
    for (const [fn, cost] of Object.entries(AI_UNIT_COST)) {
      expect(cost, `${fn} costs ${cost}, above the burst limit`).toBeLessThanOrEqual(BURST_UNIT_LIMIT)
      expect(rateLimitFor(fn), `${fn} has a non-positive rate limit`).toBeGreaterThan(0)
    }
  })

  it("the brand-only Brave search is throttled like the other Brave calls (C7c)", () => {
    expect(unitCostFor("brandFromModel")).toBe(1)
    expect(rateLimitFor("brandFromModel")).toBe(rateLimitFor("findManual"))
  })

  it("proxyPdf has a per-minute AND a per-day call cap (C7b)", () => {
    expect(rateLimitFor("proxyPdf")).toBeGreaterThan(0)
    expect(DAILY_CALL_CAP.proxyPdf).toBeGreaterThan(rateLimitFor("proxyPdf"))
    // 50 MB × cap bounds one account's daily egress.
    expect(DAILY_CALL_CAP.proxyPdf * 50).toBeLessThanOrEqual(5_000)
  })
})

describe("the daily caps' relationships hold after they change", () => {
  it("the default day covers two full appliance adds — the tester allowance", () => {
    // 50 units/day (2026-09-30) was sized as one add-with-manual plus a handful
    // of questions. If an add ever outgrows half the day, a tester cannot add
    // two appliances on their first day, which is what onboarding invites.
    expect(costOf(ADD_ONE_APPLIANCE) * 2).toBeLessThanOrEqual(DEFAULT_DAILY_UNITS)
  })

  it("one user cannot outrun the app-wide ceiling in a single day", () => {
    // The guard that actually remains. If a day's allowance ever exceeds the
    // month's, the monthly ceiling stops being a backstop at all — one user
    // could close the app for everyone before lunch.
    expect(DEFAULT_DAILY_UNITS).toBeLessThan(DEFAULT_MONTHLY_UNIT_CEILING)
  })

  it("the burst limit still bites before the daily one", () => {
    // If burst ever exceeded the daily allowance, a loop would spend the whole
    // day's budget inside one minute with nothing to stop it.
    expect(BURST_UNIT_LIMIT).toBeLessThan(DEFAULT_DAILY_UNITS)
  })
})

describe("the per-function daily call cap (owner: 50 scans a day)", () => {
  const base = {
    dailyUnits: 0, dailyLimit: DEFAULT_DAILY_UNITS,
    monthlyUnits: 0, monthlyCeiling: DEFAULT_MONTHLY_UNIT_CEILING,
    units: AI_UNIT_COST.enqueueParse,
  }
  const cap = dailyCallLimitFor("enqueueParse")!

  it("comes from config/spend.scansPerDay, 50 by default", () => {
    expect(cap).toBe(50)
    expect(dailyCallLimitFor("enqueueParse", config({ scansPerDay: 7 }))).toBe(7)
  })

  it("allows the 50th scan and refuses the 51st", () => {
    expect(decideQuota({ ...base, fnCallsToday: cap - 1, fnCallLimit: cap })).toEqual({ allowed: true })
    expect(decideQuota({ ...base, fnCallsToday: cap, fnCallLimit: cap }))
      .toEqual({ allowed: false, reason: "fnDaily" })
  })

  it("is checked BEFORE the shared pool, so the message is the useful one", () => {
    // With scans exhausted but plenty of units left, the user should be told
    // they are out of scans — not out of allowance, which is still true for
    // everything else they might do.
    const v = decideQuota({ ...base, dailyUnits: 0, fnCallsToday: 50, fnCallLimit: 50 })
    expect(v).toEqual({ allowed: false, reason: "fnDaily" })
  })

  it("does not touch functions without a cap", () => {
    // Chat, lookups and OCR keep drawing on the shared pool alone.
    expect(dailyCallLimitFor("chatQuery")).toBeNull()
    expect(dailyCallLimitFor("findManual")).toBeNull()
    expect(decideQuota({ ...base, units: 1, fnCallsToday: 9999, fnCallLimit: null }))
      .toEqual({ allowed: true })
  })

  it("scansPerDay: 0 pauses scanning — a refusal, not a crash", () => {
    expect(decideQuota({ ...base, fnCallsToday: 0, fnCallLimit: 0 })).toEqual({ allowed: false, reason: "fnDaily" })
  })

  it("corrupt counts are a config error, not the user's problem", () => {
    expect(decideQuota({ ...base, fnCallsToday: -1, fnCallLimit: 50 }))
      .toEqual({ allowed: false, reason: "invalid" })
    expect(decideQuota({ ...base, fnCallsToday: 0, fnCallLimit: -1 }))
      .toEqual({ allowed: false, reason: "invalid" })
  })

  it("50 scans is the money cap, and it is well under the monthly ceiling", () => {
    // ~$0.55 a manual measured => 50/day is roughly $27/day for one user.
    // It has to stay affordable against the app-wide month, or one person's
    // full day would close the app for everyone.
    const dayCost = cap * AI_UNIT_COST.enqueueParse
    expect(dayCost).toBeLessThan(DEFAULT_MONTHLY_UNIT_CEILING / 2)
  })
})
