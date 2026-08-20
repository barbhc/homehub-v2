/**
 * Phase 2: the manual's stated range IS the window.
 *
 * "Every 6-12 months" was collapsed to one number and then dressed as a date.
 * These pin both halves — the extraction guard that refuses invented ranges,
 * and the window maths that uses a real one.
 */
import { describe, it, expect } from "vitest"
import { dueWindow, rangeTolerance, windowPhrase } from "./dueWindow"
import { normalizeIntervalRange } from "../parse/parseCore"

describe("normalizeIntervalRange", () => {
  it("accepts a plain stated range", () => {
    expect(normalizeIntervalRange(180, 365)).toEqual({ interval_days_min: 180, interval_days_max: 365 })
  })

  it("accepts a single figure stated as both bounds", () => {
    expect(normalizeIntervalRange(90, 90)).toEqual({ interval_days_min: 90, interval_days_max: 90 })
  })

  it("refuses a reversed, zero, or non-numeric range", () => {
    const none = { interval_days_min: null, interval_days_max: null }
    expect(normalizeIntervalRange(365, 180)).toEqual(none)
    expect(normalizeIntervalRange(0, 90)).toEqual(none)
    expect(normalizeIntervalRange("6 months", 365)).toEqual(none)
    expect(normalizeIntervalRange(null, undefined)).toEqual(none)
  })

  it("refuses an absurd span — a misread, not a manual's advice", () => {
    const none = { interval_days_min: null, interval_days_max: null }
    // Beyond five years.
    expect(normalizeIntervalRange(30, 3650)).toEqual(none)
    // More than 10x — "every 30 to 400 days" is not something a manual says.
    expect(normalizeIntervalRange(30, 400)).toEqual(none)
  })

  it("rounds fractional days rather than dropping the range", () => {
    expect(normalizeIntervalRange(29.6, 90.2)).toEqual({ interval_days_min: 30, interval_days_max: 90 })
  })
})

describe("a stated range beats the cadence default", () => {
  const T = "2026-08-20"

  it("uses half the span as the window", () => {
    expect(rangeTolerance(180, 365)).toBe(93)
    // An annual task whose manual says 6-12 months gets ±93d, not the ±42d default.
    const w = dueWindow("2026-08-20", "annual", { today: T, intervalDaysMin: 180, intervalDaysMax: 365 })
    expect(w.start).toBe("2026-05-19")
    expect(w.end).toBe("2026-11-21")
  })

  it("falls back to the cadence default when the manual gave no range", () => {
    expect(rangeTolerance(null, null)).toBeNull()
    const w = dueWindow("2026-08-20", "annual", { today: T })
    expect(w.start).toBe("2026-07-09") // ±42d
  })

  it("a single stated figure means a tight window, not a fabricated one", () => {
    // min === max ⇒ no span ⇒ fall back rather than claim a zero-width window.
    expect(rangeTolerance(90, 90)).toBeNull()
  })

  it("phrasing follows the real range", () => {
    // Narrow stated range on a monthly task ⇒ "This week" rather than a month.
    expect(windowPhrase("2026-08-20", "monthly", { today: T, intervalDaysMin: 28, intervalDaysMax: 32 }))
      .toBe("This week")
  })
})
