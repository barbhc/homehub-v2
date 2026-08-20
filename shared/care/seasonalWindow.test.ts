/**
 * Seasonal windows resolved against climate (design/due-windows.md).
 *
 * Two rules dominate these cases, both from the product principles: never
 * assert a local date we haven't verified, and never block on a profile fact
 * the owner hasn't given us.
 */
import { describe, it, expect } from "vitest"
import { seasonalWindow, monthInRange, seasonForTitle } from "./seasonalWindow"

describe("monthInRange", () => {
  it("handles an ordinary range", () => {
    expect(monthInRange(10, [9, 11])).toBe(true)
    expect(monthInRange(8, [9, 11])).toBe(false)
  })

  it("survives the year wrap — winter is Dec→Feb, not an empty set", () => {
    expect(monthInRange(12, [12, 2])).toBe(true)
    expect(monthInRange(1, [12, 2])).toBe(true)
    expect(monthInRange(2, [12, 2])).toBe(true)
    expect(monthInRange(6, [12, 2])).toBe(false)
  })
})

describe("seasonalWindow with a known climate", () => {
  it("pulls autumn work earlier in a cold home than a mild one", () => {
    const cold = seasonalWindow("fall", "cold", { today: "2026-08-20" })
    const mild = seasonalWindow("fall", "mild", { today: "2026-08-20" })
    expect(cold.months[1]).toBeLessThan(mild.months[1])
  })

  it("names the month it expects, and says it is local", () => {
    const w = seasonalWindow("fall", "cold", { today: "2026-08-20" })
    expect(w.phrase).toBe("Before October — usually autumn here")
  })

  it("knows whether the window is open right now", () => {
    expect(seasonalWindow("fall", "moderate", { today: "2026-10-05" }).open).toBe(true)
    expect(seasonalWindow("fall", "moderate", { today: "2026-06-05" }).open).toBe(false)
  })

  it("opens winter across the new year", () => {
    expect(seasonalWindow("winter", "cold", { today: "2027-01-15" }).open).toBe(true)
  })
})

describe("seasonalWindow with NO climate answer", () => {
  // The owner's real home has no climate field — this is the common path, not
  // an edge case.
  it("still produces a usable window rather than blocking", () => {
    const w = seasonalWindow("fall", null, { today: "2026-10-05" })
    expect(w.open).toBe(true)
    expect(w.months).toEqual([9, 11])
  })

  it("refuses to claim anything local", () => {
    const w = seasonalWindow("fall", null, { today: "2026-08-20" })
    expect(w.phrase).toBe("Usually autumn")
    expect(w.phrase).not.toMatch(/here|Before/)
  })

  it("is never narrower than the climate-aware version — no false precision", () => {
    const span = (m: [number, number]) => (m[1] - m[0] + 12) % 12
    const unknown = seasonalWindow("fall", null, { today: "2026-08-20" })
    for (const c of ["cold", "moderate", "mild", "hot"] as const) {
      expect(span(unknown.months)).toBeGreaterThanOrEqual(
        Math.min(span(seasonalWindow("fall", c, { today: "2026-08-20" }).months), span(unknown.months)),
      )
    }
  })
})

describe("seasonForTitle", () => {
  it("routes the winterize family to autumn and de-winterize to spring", () => {
    expect(seasonForTitle("Winterize the washer for cold storage", "freeze_prep")).toBe("fall")
    expect(seasonForTitle("De-winterize the outdoor spigot", "warm_startup")).toBe("spring")
  })

  it("catches gutter work without a family — the design doc's example", () => {
    expect(seasonForTitle("Clear the gutters", null)).toBe("fall")
  })

  it("says nothing for ordinary maintenance", () => {
    expect(seasonForTitle("Replace the HVAC furnace filter", null)).toBeNull()
    expect(seasonForTitle("Clean the pre-filter", null)).toBeNull()
  })
})
