import { describe, it, expect } from "vitest"
import { computeNextDueDate } from "./nextDueDate"

describe("computeNextDueDate", () => {
  it("rolls weekly forward 7 days from the completion date", () => {
    expect(computeNextDueDate("weekly", "2026-06-22")).toBe("2026-06-29")
  })

  it("rolls every_n_days by interval from completion (not from today)", () => {
    expect(computeNextDueDate("every_n_days", "2026-01-10", { intervalDays: 90 })).toBe("2026-04-10")
  })

  it("defaults every_n_days to 30 when interval missing", () => {
    expect(computeNextDueDate("every_n_days", "2026-06-01")).toBe("2026-07-01")
  })

  it("rolls monthly/quarterly/annual by calendar months", () => {
    expect(computeNextDueDate("monthly", "2026-06-22")).toBe("2026-07-22")
    expect(computeNextDueDate("quarterly", "2026-06-22")).toBe("2026-09-22")
    expect(computeNextDueDate("annual", "2026-06-22")).toBe("2027-06-22")
  })

  it("returns null for non-recurring schedules", () => {
    expect(computeNextDueDate("after_each_use", "2026-06-22")).toBeNull()
    expect(computeNextDueDate("as_needed", "2026-06-22")).toBeNull()
    expect(computeNextDueDate("setup", "2026-06-22")).toBeNull()
  })

  describe("seasonal", () => {
    it("anchors to this year's season when it is still ahead", () => {
      // completed in Feb, fall anchor (Oct 15) is later this year
      expect(computeNextDueDate("seasonal", "2026-02-01", { season: "fall" })).toBe("2026-10-15")
    })

    it("rolls to next year when the anchor already passed", () => {
      // completed Nov 1, fall anchor (Oct 15) already passed → next year
      expect(computeNextDueDate("seasonal", "2026-11-01", { season: "fall" })).toBe("2027-10-15")
    })

    it("handles the winter (January) anchor rolling forward", () => {
      expect(computeNextDueDate("seasonal", "2026-03-01", { season: "winter" })).toBe("2027-01-15")
    })

    it("returns null when season is missing", () => {
      expect(computeNextDueDate("seasonal", "2026-06-22")).toBeNull()
    })
  })
})
