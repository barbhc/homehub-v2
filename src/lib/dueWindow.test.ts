/**
 * Due windows (design/due-windows.md).
 *
 * The behaviour these protect: a filter change never says "61 days overdue"
 * again, and a warranty expiry never stops saying it.
 */
import { describe, it, expect } from "vitest"
import {
  dueWindow, dueKindOf, windowPhrase, isTrulyOverdue, safetyPhrase, toleranceDays, shortDate,
} from "./dueWindow"

const T = "2026-08-20" // "today" for every case below

describe("dueWindow", () => {
  it("widens with the cadence", () => {
    expect(toleranceDays("weekly")).toBe(2)
    expect(toleranceDays("monthly")).toBe(7)
    expect(toleranceDays("quarterly")).toBe(21)
    expect(toleranceDays("annual")).toBe(42)
  })

  it("scales every_n_days with its interval, and caps it", () => {
    expect(toleranceDays("every_n_days", 40)).toBe(10)
    // A 5-year task must not get a 15-month window.
    expect(toleranceDays("every_n_days", 1825)).toBe(45)
    expect(toleranceDays("every_n_days", 4)).toBe(2)
  })

  it("brackets the target and locates today in it", () => {
    expect(dueWindow("2026-08-20", "monthly", { today: T })).toEqual({
      start: "2026-08-13", end: "2026-08-27", state: "open",
    })
    expect(dueWindow("2026-10-01", "monthly", { today: T }).state).toBe("upcoming")
    expect(dueWindow("2026-06-01", "monthly", { today: T }).state).toBe("lapsed")
  })

  it("does not move the target date — dueDate keeps its meaning", () => {
    const w = dueWindow("2026-09-15", "quarterly", { today: T })
    expect(w.start < "2026-09-15" && "2026-09-15" < w.end).toBe(true)
  })
})

describe("dueKindOf", () => {
  it("treats recurring maintenance as a window", () => {
    expect(dueKindOf({ title: "Replace the HVAC furnace filter", scheduleType: "monthly" })).toBe("window")
    expect(dueKindOf({ title: "Test smoke & CO detectors", scheduleType: "monthly" })).toBe("window")
  })

  it("recognises the genuinely date-bound", () => {
    expect(dueKindOf({ title: "Cafe Range — register warranty", scheduleType: "as_needed" })).toBe("deadline")
    expect(dueKindOf({ title: "Respond to recall notice", scheduleType: null })).toBe("deadline")
  })

  it("is conservative: deadline language on a RECURRING task is still a window", () => {
    // Otherwise "check warranty status yearly" would go red every year.
    expect(dueKindOf({ title: "Check warranty status", scheduleType: "annual" })).toBe("window")
  })

  it("routes seasonal by its schedule", () => {
    expect(dueKindOf({ title: "Clear the gutters", scheduleType: "seasonal" })).toBe("seasonal")
  })
})

describe("windowPhrase", () => {
  it("says Oct-ish, not a fake-precise date", () => {
    expect(windowPhrase("2026-10-15", "quarterly", { today: T })).toBe("Oct-ish")
  })

  it("says 'been a while' instead of counting days overdue", () => {
    const p = windowPhrase("2026-06-01", "monthly", { today: T })
    expect(p).toBe("Been a while")
    expect(p).not.toMatch(/overdue|\d+ days/i)
  })

  it("keeps a real date for a real deadline", () => {
    expect(windowPhrase("2026-09-30", null, { today: T, kind: "deadline" })).toBe("By Sep 30")
  })

  it("prefers 'this week' when the whole window is days wide", () => {
    expect(windowPhrase("2026-08-20", "weekly", { today: T })).toBe("This week")
    expect(windowPhrase("2026-08-20", "monthly", { today: T })).toBe("Good to do now")
  })
})

describe("isTrulyOverdue", () => {
  it("is reserved for deadlines", () => {
    expect(isTrulyOverdue("2026-06-01", "window", { today: T })).toBe(false)
    expect(isTrulyOverdue("2026-06-01", "seasonal", { today: T })).toBe(false)
    expect(isTrulyOverdue("2026-06-01", "deadline", { today: T })).toBe(true)
  })

  it("a future deadline is not overdue", () => {
    expect(isTrulyOverdue("2026-09-30", "deadline", { today: T })).toBe(false)
  })
})

describe("safetyPhrase", () => {
  it("names the skipped cycle without a date or red — the approved pressure", () => {
    expect(safetyPhrase("2026-07-10", "monthly", { today: T })).toBe("Monthly check · skipped July")
  })

  it("stays silent while the window is still open or ahead", () => {
    expect(safetyPhrase("2026-08-20", "monthly", { today: T })).toBeNull()
    expect(safetyPhrase("2026-10-01", "monthly", { today: T })).toBeNull()
  })
})

describe("shortDate", () => {
  it("formats without a year, the way the UI shows dates", () => {
    expect(shortDate("2026-09-30")).toBe("Sep 30")
  })
})

/**
 * Grouping must be TOTAL. Caught in build: filtering the "now" bucket on
 * explicit window states meant an item with an unset state matched no bucket
 * and silently vanished from the user's task list.
 */
import { groupTasks } from "@/components/home/tasks/shared"
import type { WeekAgendaItem } from "@/modules/care/services/weekAgenda"

const item = (over: Partial<WeekAgendaItem>): WeekAgendaItem =>
  ({
    taskInstanceId: "x", taskTemplateId: "t", title: "Task", source: "maintenance",
    priorityTier: "recommended", estimatedMinutes: 10, dueDate: "2026-08-20",
    isOverdue: false, pastDue: false, dueKind: "window", windowState: "open",
    duePhrase: "Good to do now", safetyNote: null, trulyOverdue: false,
    itemUnitId: null, itemName: null, roomName: null, ...over,
  }) as WeekAgendaItem

describe("groupTasks(urgency) is total", () => {
  it("shows every task exactly once, whatever its window state", () => {
    const tasks = [
      item({ taskInstanceId: "a", windowState: "open" }),
      item({ taskInstanceId: "b", windowState: "lapsed" }),
      item({ taskInstanceId: "c", windowState: "upcoming" }),
      item({ taskInstanceId: "d", dueKind: "deadline" }),
      // The regression: no window state at all.
      item({ taskInstanceId: "e", windowState: undefined as unknown as WeekAgendaItem["windowState"] }),
    ]
    const ids = groupTasks(tasks, "urgency").flatMap((g) => g.items.map((i) => i.taskInstanceId))
    expect([...ids].sort()).toEqual(["a", "b", "c", "d", "e"])
  })

  it("leads with deadlines, then now, then what's ahead", () => {
    const groups = groupTasks(
      [item({ taskInstanceId: "d", dueKind: "deadline" }), item({ taskInstanceId: "c", windowState: "upcoming" }), item({ taskInstanceId: "a" })],
      "urgency",
    )
    expect(groups.map((g) => g.label)).toEqual(["Deadlines", "Good to do now", "Coming up"])
  })
})
