import { describe, it, expect, afterEach } from "vitest"
import {
  AI_UNIT_COST,
  BURST_UNIT_LIMIT,
  DAILY_AI_LIMIT,
  dailyCallLimitFor,
  AI_DAILY_CALL_LIMIT,
  BURST_UNIT_LIMIT,
  DEFAULT_MONTHLY_UNIT_CEILING,
  AI_UNIT_COST,
  DEFAULT_MONTHLY_UNIT_CEILING,
  DEFAULT_RATE_LIMIT,
  RATE_WINDOW_MS,
  decideQuota,
  decideRateLimit,
  monthlyCeiling,
  rateLimitFor,
  unitCostFor,
  utcDayKey,
  utcMonthKey,
} from "./policy.js"

const base = {
  dailyUnits: 0,
  dailyLimit: 10,
  monthlyUnits: 0,
  monthlyCeiling: 1000,
  units: 1,
}

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

  it("treats a call costing more than its own daily limit as misconfiguration", () => {
    expect(decideQuota({ ...base, dailyLimit: 5, units: 10 })).toEqual({
      allowed: false,
      reason: "invalid",
    })
  })

  it.each([
    ["zero units", { units: 0 }],
    ["negative units", { units: -1 }],
    ["fractional units", { units: 1.5 }],
    ["zero daily limit", { dailyLimit: 0 }],
    ["zero ceiling", { monthlyCeiling: 0 }],
    ["NaN counter", { dailyUnits: Number.NaN }],
    ["Infinity ceiling", { monthlyCeiling: Number.POSITIVE_INFINITY }],
  ])("rejects %s", (_label, patch) => {
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

  it("keeps every function callable at least once a day", () => {
    for (const [fn, cost] of Object.entries(AI_UNIT_COST)) {
      expect(
        decideQuota({ ...base, dailyLimit: DAILY_AI_LIMIT, units: cost }),
        `${fn} costs ${cost}, above its daily limit`,
      ).toEqual({ allowed: true })
    }
  })

  it("keeps every cost well under the monthly ceiling", () => {
    for (const cost of Object.values(AI_UNIT_COST)) {
      expect(cost).toBeLessThan(DEFAULT_MONTHLY_UNIT_CEILING)
    }
  })
})

describe("monthlyCeiling", () => {
  const original = process.env.AI_MONTHLY_UNIT_CEILING
  afterEach(() => {
    if (original === undefined) delete process.env.AI_MONTHLY_UNIT_CEILING
    else process.env.AI_MONTHLY_UNIT_CEILING = original
  })

  it("uses the default when unset", () => {
    delete process.env.AI_MONTHLY_UNIT_CEILING
    expect(monthlyCeiling()).toBe(DEFAULT_MONTHLY_UNIT_CEILING)
  })

  it("reads a valid override", () => {
    process.env.AI_MONTHLY_UNIT_CEILING = "1234"
    expect(monthlyCeiling()).toBe(1234)
  })

  it.each(["0", "-5", "banana", "1e6", ""])(
    "falls back to the default rather than uncapping on %s",
    (bad) => {
      // A typo'd env var must never read as "no ceiling".
      process.env.AI_MONTHLY_UNIT_CEILING = bad
      expect(monthlyCeiling()).toBe(DEFAULT_MONTHLY_UNIT_CEILING)
    },
  )
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
})

describe("rate-limit table", () => {
  it("prices the parse endpoint tightest — it is the expensive one", () => {
    expect(rateLimitFor("enqueueParse")).toBeLessThan(rateLimitFor("chatQuery"))
  })

  it("defaults an unlisted endpoint to a real limit rather than unlimited", () => {
    expect(rateLimitFor("somethingNobodyAddedYet")).toBe(DEFAULT_RATE_LIMIT)
    expect(Number.isFinite(rateLimitFor("somethingNobodyAddedYet"))).toBe(true)
  })

  /**
   * This list is the flow AS IT ACTUALLY RUNS, and keeping it that way is the
   * point of the test. It previously omitted `ocr` and two later productLookup
   * calls, so it kept passing while the real add grew past the limit — and a
   * tester was refused mid-onboarding with "The scan failed" (HH-145). A budget
   * test measuring a flow the app no longer has is worse than none: it reports
   * headroom that does not exist.
   */
  const ADD_ONE_APPLIANCE = [
    "ocr",                 // scanning the label
    "detectDocType",
    "enqueueParse",
    "productLookup",       // identity, from the add screen
    "productLookup",       // post-create enrichment
    "productLookup",       // brand-from-model, when the scan reads one and not the other
    "findManual",
    "searchProductImages",
  ]
  const costOf = (fns: string[]) => fns.reduce((n, fn) => n + unitCostFor(fn), 0)

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
    expect(BURST_UNIT_LIMIT).toBeLessThan(DAILY_AI_LIMIT)
  })

  it("keeps every priced endpoint callable at least once per window", () => {
    for (const [fn, cost] of Object.entries(AI_UNIT_COST)) {
      expect(cost, `${fn} costs ${cost}, above the burst limit`).toBeLessThanOrEqual(BURST_UNIT_LIMIT)
      expect(rateLimitFor(fn), `${fn} has a non-positive rate limit`).toBeGreaterThan(0)
    }
  })
})

describe("the daily cap's relationships hold after it changes", () => {
  it("a day's allowance buys a sensible number of the expensive call", () => {
    // The reason 50 was raised: a manual scan is 10 units, so 50/day was five
    // scans BEFORE any lookups, OCR or doc-type checks — and a real session
    // spends most of its budget on those. Pinned as a ratio rather than a
    // number so this stays meaningful the next time either side moves.
    const scansPerDay = DAILY_AI_LIMIT / AI_UNIT_COST.enqueueParse
    expect(scansPerDay).toBeGreaterThanOrEqual(20)
  })

  it("one user cannot outrun the app-wide ceiling in a single day", () => {
    // The guard that actually remains. If a day's allowance ever exceeds the
    // month's, the monthly ceiling stops being a backstop at all — one user
    // could close the app for everyone before lunch.
    expect(DAILY_AI_LIMIT).toBeLessThan(DEFAULT_MONTHLY_UNIT_CEILING)
  })

  it("the burst limit still bites before the daily one", () => {
    // Raising the daily cap moves the anti-runaway job onto the rate limiter.
    // If burst ever exceeded the daily allowance, a loop would spend the whole
    // day's budget inside one minute with nothing to stop it.
    expect(BURST_UNIT_LIMIT).toBeLessThan(DAILY_AI_LIMIT)
  })
})

describe("the per-function daily call cap (owner: 50 scans a day)", () => {
  const base = {
    dailyUnits: 0, dailyLimit: DAILY_AI_LIMIT,
    monthlyUnits: 0, monthlyCeiling: DEFAULT_MONTHLY_UNIT_CEILING,
    units: AI_UNIT_COST.enqueueParse,
  }

  it("allows the 50th scan and refuses the 51st", () => {
    const cap = AI_DAILY_CALL_LIMIT.enqueueParse
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
    expect(decideQuota({ ...base, units: 1, fnCallsToday: 9999, fnCallLimit: null }))
      .toEqual({ allowed: true })
  })

  it("a nonsense cap is a config error, not the user's problem", () => {
    expect(decideQuota({ ...base, fnCallsToday: 0, fnCallLimit: 0 }).allowed).toBe(false)
    expect(decideQuota({ ...base, fnCallsToday: -1, fnCallLimit: 50 }))
      .toEqual({ allowed: false, reason: "invalid" })
  })

  it("50 scans is the money cap, and it is well under the monthly ceiling", () => {
    // ~$0.55 a manual measured => 50/day is roughly $27/day for one user.
    // It has to stay affordable against the app-wide month, or one person's
    // full day would close the app for everyone.
    const dayCost = AI_DAILY_CALL_LIMIT.enqueueParse * AI_UNIT_COST.enqueueParse
    expect(dayCost).toBeLessThan(DEFAULT_MONTHLY_UNIT_CEILING / 2)
  })
})
