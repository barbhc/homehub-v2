/**
 * formatDate — the item editor's purchase / install / warranty dates.
 *
 * Those are calendar dates (YYYY-MM-DD). `new Date("2026-09-30")` is UTC
 * midnight, which every US zone shows as the day before, so the editor printed
 * each of them a day early, all day. The suite runs in Pacific (vitest.config.ts).
 */
import { describe, expect, it } from "vitest"
import { formatDate } from "./utils"

describe("formatDate", () => {
  it("prints a calendar date as that day", () => {
    expect(formatDate("2026-09-30")).toBe("Sep 30, 2026")
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026")
  })

  it("still reads a full timestamp as the instant it is", () => {
    expect(formatDate("2026-10-01T02:30:00Z")).toBe("Sep 30, 2026") // 19:30 PDT
  })

  it("is null for no date", () => {
    expect(formatDate(null)).toBeNull()
    expect(formatDate("")).toBeNull()
  })
})
