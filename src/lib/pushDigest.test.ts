/**
 * The push lanes (design/due-windows.md).
 *
 * The rules the notification must obey, tested through the same shared helper
 * the function imports — so the alert and the screen it opens cannot disagree.
 */
import { describe, it, expect } from "vitest"
import { dueKindOf, safetyPhrase } from "../../shared/care/dueWindow"

const today = "2026-08-20"

describe("which lane a task belongs to", () => {
  it("routine maintenance is a window — it must NOT push day-of", () => {
    expect(dueKindOf({ title: "Replace the HVAC furnace filter", scheduleType: "monthly" })).toBe("window")
    expect(dueKindOf({ title: "Clean the pre-filter", scheduleType: "monthly" })).toBe("window")
  })

  it("a real deadline still pushes the day it lands", () => {
    expect(dueKindOf({ title: "Register the warranty", scheduleType: "as_needed" })).toBe("deadline")
  })

  it("a lapsed safety check is flagged for the digest, not silenced", () => {
    expect(safetyPhrase("2026-07-10", "monthly", { today })).toBe("Monthly check · skipped July")
  })

  it("a safety check still inside its window says nothing", () => {
    expect(safetyPhrase("2026-08-20", "monthly", { today })).toBeNull()
  })
})

describe("digest day", () => {
  // The function derives the weekday from the Pacific date string it already
  // computes. This pins the arithmetic that decides whether the digest runs.
  const weekdayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()

  it("fires on Sunday only", () => {
    expect(weekdayOf("2026-08-23")).toBe(0) // Sunday
    expect(weekdayOf("2026-08-20")).toBe(4) // Thursday
    expect(weekdayOf("2026-08-24")).toBe(1) // Monday
  })
})
