import { describe, it, expect, afterEach } from "vitest"
import {
  AI_UNIT_COST,
  DAILY_AI_LIMIT,
  DEFAULT_MONTHLY_UNIT_CEILING,
  decideQuota,
  monthlyCeiling,
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
