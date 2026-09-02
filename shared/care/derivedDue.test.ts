import { describe, it, expect } from "vitest"
import { derivedDue, dueKindOf, windowPhrase, isTrulyOverdue } from "./dueWindow"

/**
 * The owner, QA'ing on 2026-09-01: Home's "Coming up" said "Good to do now"
 * for one row and "Wed, Sep 2" for the next — same kind of task. The forward
 * rows came from a feed whose row type had dropped `scheduleType`, so a date
 * was all it could print. A window has no deadline; printing one invents a
 * promise (design/due-windows.md).
 */
const TODAY = "2026-09-01"

describe("derivedDue — one derivation for every surface", () => {
  it("a recurring task in its window gets a PHRASE, never a date", () => {
    const d = derivedDue({ title: "Wipe door seal and interior", scheduleType: "monthly", dueDate: "2026-09-02" }, { today: TODAY })
    expect(d.dueKind).toBe("window")
    expect(d.duePhrase).toBe("Good to do now")
    expect(d.duePhrase).not.toMatch(/Sep|\d{4}-\d{2}/)
  })

  it("a lapsed window says so calmly, and is NOT truly overdue", () => {
    const d = derivedDue({ title: "Clean the pre-filter", scheduleType: "monthly", dueDate: "2026-06-01" }, { today: TODAY })
    expect(d.duePhrase).toBe("Been a while")
    expect(d.trulyOverdue).toBe(false)
  })

  it("far ahead reads month-ish — still not a hard date", () => {
    const d = derivedDue({ title: "Run tub clean cycle", scheduleType: "annual", dueDate: "2027-02-10" }, { today: TODAY })
    expect(d.duePhrase).toBe("Feb-ish")
  })

  it("a DEADLINE keeps its date — it is the one kind that earned one", () => {
    const d = derivedDue({ title: "Warranty registration expires", scheduleType: "as_needed", dueDate: "2026-09-30" }, { today: TODAY })
    expect(d.dueKind).toBe("deadline")
    expect(d.duePhrase).toBe("By Sep 30")
    expect(derivedDue({ title: "Warranty expires", scheduleType: "as_needed", dueDate: "2026-08-01" }, { today: TODAY }).trulyOverdue).toBe(true)
  })

  it("a stated range narrows the window instead of inheriting the cadence default", () => {
    // Annual carries a ±42-day default, so 19 days out reads as "in its window".
    // "Every 28-34 days" is a 3-day window, so the same date is still ahead.
    const task = { title: "Replace the filter", scheduleType: "annual" as const, dueDate: "2026-09-20" }
    const wide = derivedDue(task, { today: TODAY })
    const narrow = derivedDue(task, { today: TODAY, intervalDaysMin: 28, intervalDaysMax: 34 })
    expect(wide.duePhrase).toBe("Good to do now")
    expect(narrow.duePhrase).toBe("Sep-ish")
  })

  it("safety-critical work carries its firm note only once a cycle has lapsed", () => {
    const lapsed = derivedDue({ title: "Test smoke alarms", scheduleType: "semiannual", dueDate: "2026-01-01", isSafetyCritical: true }, { today: TODAY })
    expect(lapsed.safetyNote).toBeTruthy()
    const ahead = derivedDue({ title: "Test smoke alarms", scheduleType: "semiannual", dueDate: "2026-09-20", isSafetyCritical: true }, { today: TODAY })
    expect(ahead.safetyNote).toBeNull()
    expect(derivedDue({ title: "Test smoke alarms", scheduleType: "semiannual", dueDate: "2026-01-01" }, { today: TODAY }).safetyNote).toBeNull()
  })

  /**
   * The anti-drift pin. getWeekAgenda derives its non-usage, non-seasonal case
   * inline; this asserts derivedDue is EXACTLY that expression, so the two
   * surfaces cannot end up saying different things about the same task again.
   */
  it("matches getWeekAgenda's inline derivation for the plain case", () => {
    const rows = [
      { title: "Wipe door seal", scheduleType: "monthly", dueDate: "2026-09-02", careType: "maintenance" },
      { title: "Run tub clean cycle", scheduleType: "quarterly", dueDate: "2026-09-16", careType: "cleaning" },
      { title: "Warranty expires", scheduleType: "as_needed", dueDate: "2026-09-30", careType: "maintenance" },
      { title: "Check ductwork", scheduleType: "annual", dueDate: "2026-05-01", careType: "maintenance" },
    ] as const
    for (const r of rows) {
      const kind = dueKindOf({ title: r.title, scheduleType: r.scheduleType, careType: r.careType })
      const inline = windowPhrase(r.dueDate, r.scheduleType, { today: TODAY, kind })
      const d = derivedDue(r, { today: TODAY })
      expect({ kind: d.dueKind, phrase: d.duePhrase }).toEqual({ kind, phrase: inline })
      expect(d.trulyOverdue).toBe(isTrulyOverdue(r.dueDate, kind, { today: TODAY }))
      expect(d.safetyNote).toBe(null)
    }
  })
})
