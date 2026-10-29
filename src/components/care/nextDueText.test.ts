import { describe, it, expect } from "vitest"
import { dueDateLabel, nextDueText } from "./nextDueText"

const TODAY = "2026-10-28"
const at = (nextDue: string, overdue = false) =>
  nextDueText({ kind: "scheduled", nextDue, basis: "last-done", overdue, moves: [], create: false }, TODAY)

describe("the Next due line — one short phrase", () => {
  it("names the date, with the year only when it is not this year", () => {
    expect(at("2026-11-03")).toBe("Next due: Nov 3")
    expect(at("2027-01-15")).toBe("Next due: Jan 15, 2027")
  })
  it("a date already past says so, plainly", () => {
    expect(at("2026-06-15", true)).toBe("Next due: Jun 15 — due now")
  })
  it("no date: says there is none; needs a season: no line (the editor asks)", () => {
    expect(nextDueText({ kind: "unscheduled", remove: [] }, TODAY)).toBe("No due date")
    expect(nextDueText({ kind: "needs-season" }, TODAY)).toBeNull()
  })
  it("dueDateLabel", () => {
    expect(dueDateLabel("2025-12-01", TODAY)).toBe("Dec 1, 2025")
  })
})
