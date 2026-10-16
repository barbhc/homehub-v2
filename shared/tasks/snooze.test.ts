import { describe, expect, it } from "vitest"
import { comesDueOn, effectiveDueDate, isOnListToday, isSnoozedAway, SNOOZE_DAYS } from "./snooze"

const TODAY = "2026-10-15"

describe("effectiveDueDate — the one rule every list and the push sweep read", () => {
  it("a scheduled task is due its stored date", () => {
    expect(effectiveDueDate({ status: "scheduled", dueDate: "2026-10-20" }, TODAY)).toBe("2026-10-20")
  })

  it("a snoozed task is off the list until its snooze ends", () => {
    const t = { status: "snoozed", dueDate: "2026-10-10", snoozedUntil: "2026-10-29" }
    expect(effectiveDueDate(t, TODAY)).toBeNull()
    expect(effectiveDueDate(t, "2026-10-28")).toBeNull()
    expect(isOnListToday(t, TODAY)).toBe(false)
    expect(isSnoozedAway(t, TODAY)).toBe(true)
  })

  it("on the day the snooze ends it is back, due THAT day — not overdue from the date it was put off from", () => {
    const t = { status: "snoozed", dueDate: "2026-10-10", snoozedUntil: "2026-10-29" }
    expect(effectiveDueDate(t, "2026-10-29")).toBe("2026-10-29")
    expect(effectiveDueDate(t, "2026-11-02")).toBe("2026-10-29")
    expect(isSnoozedAway(t, "2026-10-29")).toBe(false)
  })

  it("a snooze shorter than the wait to the due date keeps the due date", () => {
    expect(effectiveDueDate({ status: "snoozed", dueDate: "2026-12-01", snoozedUntil: "2026-10-01" }, TODAY)).toBe("2026-12-01")
  })

  it("a snooze with no usable date never hides a task for good", () => {
    expect(effectiveDueDate({ status: "snoozed", dueDate: "2026-10-12", snoozedUntil: null }, TODAY)).toBe("2026-10-12")
    expect(effectiveDueDate({ status: "snoozed", dueDate: "2026-10-12", snoozedUntil: 42 }, TODAY)).toBe("2026-10-12")
  })

  it("done and skipped tasks are not open", () => {
    expect(effectiveDueDate({ status: "done", dueDate: TODAY }, TODAY)).toBeNull()
    expect(effectiveDueDate({ status: "skipped", dueDate: TODAY }, TODAY)).toBeNull()
  })

  it("Snooze is two weeks", () => {
    expect(SNOOZE_DAYS).toBe(14)
  })
})

describe("comesDueOn — when, for a surface that lists a snoozed task anyway", () => {
  it("says the day the snooze ends, or the due date if that is later", () => {
    expect(comesDueOn({ status: "snoozed", dueDate: "2026-10-10", snoozedUntil: "2026-10-29" })).toBe("2026-10-29")
    expect(comesDueOn({ status: "snoozed", dueDate: "2026-12-01", snoozedUntil: "2026-10-29" })).toBe("2026-12-01")
    expect(comesDueOn({ status: "scheduled", dueDate: "2026-10-20", snoozedUntil: "2026-10-29" })).toBe("2026-10-20")
    expect(comesDueOn({ status: "done", dueDate: "2026-10-20" })).toBeNull()
  })
})
