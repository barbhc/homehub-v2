import { describe, it, expect } from "vitest"
import { applyTierFilter, isFocusTask, computeInsight } from "./shared"
import type { WeekAgendaItem } from "@/modules/care"

/** Minimal WeekAgendaItem factory — only the fields the tier filter reads. */
function task(partial: Partial<WeekAgendaItem>): WeekAgendaItem {
  return {
    taskInstanceId: Math.random().toString(36).slice(2),
    priorityTier: "recommended",
    isOverdue: false,
    pastDue: false,
    dueDate: "2026-06-24",
    itemName: null,
    roomName: null,
    estimatedMinutes: 10,
    ...partial,
  } as WeekAgendaItem
}

const essential = task({ priorityTier: "essential" })
const recommended = task({ priorityTier: "recommended" })
const optional = task({ priorityTier: "optional" })
const overdueOptional = task({ priorityTier: "optional", isOverdue: true })
const overdueRecommended = task({ priorityTier: "recommended", isOverdue: true })

const ALL = [essential, recommended, optional, overdueOptional, overdueRecommended]

describe("isFocusTask — essential OR overdue (any tier)", () => {
  it("essential (not overdue) is focus", () => expect(isFocusTask(essential)).toBe(true))
  it("overdue optional is focus", () => expect(isFocusTask(overdueOptional)).toBe(true))
  it("overdue recommended is focus", () => expect(isFocusTask(overdueRecommended)).toBe(true))
  it("non-overdue recommended is NOT focus", () => expect(isFocusTask(recommended)).toBe(false))
  it("non-overdue optional is NOT focus", () => expect(isFocusTask(optional)).toBe(false))
})

describe("applyTierFilter", () => {
  it("focus = essential + all overdue; excludes calm recommended/optional", () => {
    const out = applyTierFilter(ALL, "focus", "all")
    expect(out).toContain(essential)
    expect(out).toContain(overdueOptional)
    expect(out).toContain(overdueRecommended)
    expect(out).not.toContain(recommended)
    expect(out).not.toContain(optional)
    expect(out).toHaveLength(3)
  })

  it("all returns everything", () => {
    expect(applyTierFilter(ALL, "all", "all")).toHaveLength(ALL.length)
  })

  it("a specific tier returns only that tier (ignoring overdue)", () => {
    const out = applyTierFilter(ALL, "optional", "all")
    expect(out).toEqual([optional, overdueOptional])
  })

  it("item filter composes with the tier filter", () => {
    const fridge = task({ priorityTier: "essential", itemName: "Fridge" })
    const range = task({ priorityTier: "essential", itemName: "Range" })
    const out = applyTierFilter([fridge, range], "focus", "Fridge")
    expect(out).toEqual([fridge])
  })

  it("empty-focus is possible while all is non-empty (drives the fallback link)", () => {
    const calmOnly = [recommended, optional]
    expect(applyTierFilter(calmOnly, "focus", "all")).toHaveLength(0)
    expect(applyTierFilter(calmOnly, "all", "all")).toHaveLength(2)
  })
})

// The "Start here" banner surfaces ONLY for work that is genuinely late.
//
// Under due windows (design/due-windows.md) that is `trulyOverdue` — a real
// calendar deadline that has passed — NOT `isOverdue`, which a window-kind task
// reaches simply by drifting past its target. These two assertions still named
// the pre-window contract ("N essential tasks are overdue") and went red when
// computeInsight moved to deadlines; they are updated here rather than the
// implementation, because a filter change that is due "sometime this month"
// showing "Start here" is exactly the false urgency the redesign removed.
describe("computeInsight — Start here, or nothing", () => {
  it("2 passed deadlines → kind: start, 'Start here'", () => {
    const tasks = [
      task({ priorityTier: "essential", isOverdue: true, trulyOverdue: true }),
      task({ priorityTier: "essential", isOverdue: true, trulyOverdue: true }),
    ]
    const insight = computeInsight(tasks)!
    expect(insight.kind).toBe("start")
    expect(insight.label).toBe("Start here")
    expect(insight.text).toMatch(/2 deadlines have passed/)
  })

  it("1 passed deadline → singular copy", () => {
    const insight = computeInsight([task({ priorityTier: "essential", isOverdue: true, trulyOverdue: true })])!
    expect(insight.kind).toBe("start")
    expect(insight.text).toMatch(/1 deadline has passed/)
  })

  it("an essential past its WINDOW is not a deadline → no 'Start here'", () => {
    // The whole point of windows: drifting past a target is "been a while",
    // not "late". Only trulyOverdue earns the banner.
    const tasks = [
      task({ priorityTier: "essential", isOverdue: true, trulyOverdue: false }),
      task({ priorityTier: "essential", isOverdue: true, trulyOverdue: false }),
    ]
    expect(computeInsight(tasks)?.label).not.toBe("Start here")
  })

  it("a lapsed safety check earns firmness, without the word overdue", () => {
    const insight = computeInsight([
      task({ priorityTier: "essential", safetyNote: "Monthly check · skipped July" }),
    ])!
    expect(insight.label).toBe("Worth doing")
    expect(insight.text).toMatch(/1 safety check has skipped a cycle/)
    expect(insight.text).not.toMatch(/overdue/i)
  })

  it("essentials that are past-due but NEVER completed are NOT overdue → no banner", () => {
    // isOverdue is false (the calm default for never-started work).
    const tasks = [
      task({ priorityTier: "essential", isOverdue: false, pastDue: true }),
      task({ priorityTier: "essential", isOverdue: false, pastDue: true }),
    ]
    expect(computeInsight(tasks)).toBe(null)
  })

  // ── the room hint must be TRUE ────────────────────────────────────────────
  // Reported from a real session: three tasks, one per room, produced "Most of
  // your list is in the Home — knock it out in one pass." One of three is not
  // "most", and asserting something we haven't verified is the one thing this
  // product must not do. The banner now has to earn its place.

  it("REGRESSION: one task per room says nothing at all", () => {
    const tasks = [
      task({ roomName: "Home" }),
      task({ roomName: "Laundry Room" }),
      task({ roomName: "Kitchen" }),
    ]
    expect(computeInsight(tasks)).toBe(null)
  })

  it("a real majority in one room, and enough of them to be worth a trip → banner", () => {
    const tasks = [
      task({ roomName: "Kitchen" }), task({ roomName: "Kitchen" }),
      task({ roomName: "Kitchen" }), task({ roomName: "Kitchen" }),
      task({ roomName: "Garage" }),
    ]
    const insight = computeInsight(tasks)!
    expect(insight.kind).toBe("calm")
    // States the actual numbers rather than the vague "most".
    expect(insight.text).toMatch(/4 of your 5 tasks are in the Kitchen/)
  })

  it("a bare majority of only two is not worth a banner", () => {
    const tasks = [task({ roomName: "Kitchen" }), task({ roomName: "Kitchen" }), task({ roomName: "Garage" })]
    expect(computeInsight(tasks)).toBe(null)
  })

  it("an exact tie is never 'most' — half is not a majority", () => {
    const tasks = [
      task({ roomName: "Kitchen" }), task({ roomName: "Kitchen" }), task({ roomName: "Kitchen" }),
      task({ roomName: "Garage" }), task({ roomName: "Garage" }), task({ roomName: "Garage" }),
    ]
    expect(computeInsight(tasks)).toBe(null)
  })

  it("an empty list says nothing", () => {
    expect(computeInsight([])).toBe(null)
  })
})
