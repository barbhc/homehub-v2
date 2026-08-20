/**
 * Phase 3 — indicator-driven tasks.
 *
 * Every title below is REAL, read out of the owner's home (429 templates).
 * The range-hood cases are why this inference is narrow: that item has both a
 * charcoal-filter timer AND two lamp tasks, and a looser rule turns a bulb
 * replacement into a filter check.
 */
import { describe, it, expect } from "vitest"
import { isIndicatorResetTask, indicatorDrivenTitles, usagePhrase } from "./usageSignal"

describe("isIndicatorResetTask", () => {
  it("recognises the real reset tasks", () => {
    expect(isIndicatorResetTask("Reset Filter Cleaning Indicator")).toBe(true)
    expect(isIndicatorResetTask("Reset Clean Filter Indicator")).toBe(true)
    expect(isIndicatorResetTask("Reset Charcoal Filter Timer")).toBe(true)
    expect(isIndicatorResetTask("Reset the Check Filter Indicator")).toBe(true)
  })

  it("does NOT treat lamps as indicators — both are on the same real hood", () => {
    expect(isIndicatorResetTask("Check LED Light Operation")).toBe(false)
    expect(isIndicatorResetTask("Replace LumiLight LED")).toBe(false)
  })

  it("needs the verb, not just the noun", () => {
    expect(isIndicatorResetTask("Filter Indicator")).toBe(false)
    expect(isIndicatorResetTask("Clean Aluminum Mesh Filters")).toBe(false)
  })
})

describe("indicatorDrivenTitles", () => {
  const hood = [
    "Reset Charcoal Filter Timer",
    "Replace Charcoal Filters",
    "Clean Aluminum Mesh Filters",
    "Check LED Light Operation",
    "Replace LumiLight LED",
    "Inspect Ductwork for Leaks",
    "Clean Stainless Steel Surface",
  ]

  it("links the reset to the filter work it watches", () => {
    const driven = indicatorDrivenTitles(hood)
    expect(driven.has("Replace Charcoal Filters")).toBe(true)
    expect(driven.has("Clean Aluminum Mesh Filters")).toBe(true)
  })

  it("leaves the lamp, the ductwork and the surface alone", () => {
    const driven = indicatorDrivenTitles(hood)
    expect(driven.has("Replace LumiLight LED")).toBe(false)
    expect(driven.has("Inspect Ductwork for Leaks")).toBe(false)
    expect(driven.has("Clean Stainless Steel Surface")).toBe(false)
  })

  it("never marks the reset task itself — that would be circular", () => {
    expect(indicatorDrivenTitles(hood).has("Reset Charcoal Filter Timer")).toBe(false)
  })

  it("stays empty when the item has no indicator at all", () => {
    expect(indicatorDrivenTitles(["Clean Door Gasket", "Replace Water Filter"]).size).toBe(0)
  })

  it("handles the purifier case that started this", () => {
    const levoit = ["Reset the Check Filter Indicator", "Replace the HEPA and Carbon Filter", "Clean the Pre-Filter"]
    const driven = indicatorDrivenTitles(levoit)
    expect(driven.has("Replace the HEPA and Carbon Filter")).toBe(true)
    expect(driven.has("Clean the Pre-Filter")).toBe(true)
  })
})

describe("usagePhrase", () => {
  it("leads with the indicator and keeps our cadence as the fallback", () => {
    expect(usagePhrase("semiannual")).toBe("When the indicator comes on · or about every 6 months")
    expect(usagePhrase("monthly")).toBe("When the indicator comes on · or about monthly")
  })

  it("never promises a date — a window phrase would defeat the point", () => {
    expect(usagePhrase(null)).toBe("When the indicator comes on")
    expect(usagePhrase("as_needed")).toBe("When the indicator comes on")
  })
})
