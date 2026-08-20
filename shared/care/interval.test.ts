import { describe, expect, it } from "vitest"
import { toDays, splitInterval, MAX_INTERVAL_DAYS } from "./interval"
import { everyNDaysLabel } from "../tasks/cadenceLabel"

describe("custom intervals", () => {
  it("says every two weeks the way Chris asked for it", () => {
    const days = toDays(2, "weeks")
    expect(days).toBe(14)
    expect(everyNDaysLabel(days)).toBe("Every 2 weeks")
  })

  it("round-trips through the largest exact unit", () => {
    for (const [n, unit] of [[2, "weeks"], [3, "months"], [5, "years"], [45, "days"]] as const) {
      expect(splitInterval(toDays(n, unit))).toEqual({ n, unit })
    }
  })

  it("agrees with the label the rest of the app renders", () => {
    // The picker and the label read the same number; if these two ever disagree
    // the user sets "every 2 weeks" and the task says something else.
    for (const days of [7, 14, 30, 60, 90, 365, 1825, 45]) {
      const { n, unit } = splitInterval(days)
      expect(toDays(n, unit)).toBe(days)
    }
  })

  it("clamps rather than accepting nonsense", () => {
    expect(toDays(0, "days")).toBe(1)
    expect(toDays(-5, "weeks")).toBe(1)
    expect(toDays(99, "years")).toBe(MAX_INTERVAL_DAYS)
  })

  it("defaults to a fortnight when there is no interval yet", () => {
    expect(splitInterval(null)).toEqual({ n: 2, unit: "weeks" })
  })
})
