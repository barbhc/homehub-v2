import { describe, it, expect } from "vitest"
import { applyTierFilter, isFocusTask } from "./shared"
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
