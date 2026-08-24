import { describe, it, expect } from "vitest"
import {
  daysInMonth,
  firstWeekdayMondayFirst,
  parseIso,
  shiftMonth,
  monthGrid,
  monthLabel,
  formatIsoShort,
  toIso,
} from "./monthGrid"

describe("monthGrid — timezone-free date maths", () => {
  it("counts days, including February in a leap year", () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2023, 2)).toBe(28)
    expect(daysInMonth(2024, 3)).toBe(31)
    expect(daysInMonth(2024, 4)).toBe(30)
  })

  it("handles the century leap-year rule", () => {
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
  })

  it("puts the 1st on the right Monday-first weekday", () => {
    // 1 March 2024 was a Friday → index 4 with Monday at 0.
    expect(firstWeekdayMondayFirst(2024, 3)).toBe(4)
    // 1 September 2024 was a Sunday → index 6, not 0.
    expect(firstWeekdayMondayFirst(2024, 9)).toBe(6)
  })

  it("parses an ISO date without shifting it into the previous day", () => {
    // The whole reason this module avoids `new Date(iso)`.
    expect(parseIso("2024-03-14")).toEqual({ year: 2024, month: 3, day: 14 })
    expect(parseIso("2024-01-01")).toEqual({ year: 2024, month: 1, day: 1 })
  })

  it("rejects malformed, impossible and empty dates", () => {
    expect(parseIso("2024-13-01")).toBeNull()
    expect(parseIso("2023-02-29")).toBeNull()
    expect(parseIso("14/03/2024")).toBeNull()
    expect(parseIso("")).toBeNull()
    expect(parseIso(null)).toBeNull()
    expect(parseIso(undefined)).toBeNull()
  })

  it("accepts 29 February in a leap year", () => {
    expect(parseIso("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 })
  })

  it("rolls the year over when stepping months", () => {
    expect(shiftMonth(2024, 12, 1)).toEqual({ year: 2025, month: 1 })
    expect(shiftMonth(2024, 1, -1)).toEqual({ year: 2023, month: 12 })
    expect(shiftMonth(2024, 3, -14)).toEqual({ year: 2023, month: 1 })
  })

  it("always returns exactly six weeks, so the grid never changes height", () => {
    for (const [y, m] of [[2024, 2], [2024, 3], [2024, 9], [2021, 2]] as const) {
      expect(monthGrid(y, m)).toHaveLength(42)
    }
  })

  it("pads with real neighbouring days rather than blanks", () => {
    const grid = monthGrid(2024, 3)
    expect(grid[0]).toEqual({ iso: "2024-02-26", day: 26, inMonth: false })
    expect(grid[4]).toEqual({ iso: "2024-03-01", day: 1, inMonth: true })
    expect(grid.at(-1)!.inMonth).toBe(false)
  })

  it("marks exactly the month's own days as inMonth", () => {
    expect(monthGrid(2024, 3).filter((c) => c.inMonth)).toHaveLength(31)
    expect(monthGrid(2024, 2).filter((c) => c.inMonth)).toHaveLength(29)
  })

  it("starts a Sunday-first month with a full leading week", () => {
    // September 2024 starts on a Sunday, so six days are borrowed from August.
    const grid = monthGrid(2024, 9)
    expect(grid.slice(0, 6).every((c) => !c.inMonth)).toBe(true)
    expect(grid[6]).toEqual({ iso: "2024-09-01", day: 1, inMonth: true })
  })

  it("formats for the field and the header", () => {
    expect(formatIsoShort("2024-03-14")).toBe("14 Mar 2024")
    expect(formatIsoShort("2024-12-01")).toBe("1 Dec 2024")
    expect(formatIsoShort(null)).toBe("")
    expect(formatIsoShort("nonsense")).toBe("")
    expect(monthLabel(2024, 3)).toBe("March 2024")
  })

  it("zero-pads ISO output", () => {
    expect(toIso(2024, 3, 4)).toBe("2024-03-04")
  })
})
