/**
 * Tasks-page priority filter.
 *
 * "Focus" is now "Needs you". The owner's words: "I don't understand the
 * difference between focus and all." The behaviour (essential OR overdue) was
 * right and is the default — the label just never said what it selected.
 */
import { describe, it, expect } from "vitest"
import { TIER_FILTERS, tierFilterCounts, applyTierFilter, isFocusTask } from "@/components/home/tasks/shared"
import type { WeekAgendaItem } from "@/modules/care/services/weekAgenda"

const t = (o: Partial<WeekAgendaItem>): WeekAgendaItem => ({
  taskInstanceId: Math.random().toString(36).slice(2), title: "T", dueDate: "2026-08-01",
  priorityTier: "recommended", isOverdue: false, careType: "maintenance",
  itemName: "Furnace", roomName: "Garage", ...o,
} as WeekAgendaItem)

const CORPUS = [
  t({ priorityTier: "essential" }),
  t({ priorityTier: "recommended", isOverdue: true }),
  t({ priorityTier: "recommended" }),
  t({ priorityTier: "optional" }),
]

describe("priority filter labels", () => {
  it("every option says what it selects — no bare 'Focus'", () => {
    expect(TIER_FILTERS.map((o) => o.label)).toEqual([
      "Needs you", "All priorities", "Essential", "Recommended", "Optional",
    ])
    expect(TIER_FILTERS.some((o) => /focus/i.test(o.label))).toBe(false)
  })

  it("the trigger label is short enough to sit beside four tabs", () => {
    for (const o of TIER_FILTERS) expect(o.short.length).toBeLessThanOrEqual(11)
  })

  it("'Needs you' is still essential-OR-overdue, unchanged", () => {
    expect(isFocusTask(t({ priorityTier: "essential" }))).toBe(true)
    expect(isFocusTask(t({ priorityTier: "optional", isOverdue: true }))).toBe(true)
    expect(isFocusTask(t({ priorityTier: "recommended" }))).toBe(false)
  })
})

describe("tierFilterCounts", () => {
  it("counts every option so the menu says what each would give", () => {
    expect(tierFilterCounts(CORPUS, "all")).toEqual({
      focus: 2, all: 4, essential: 1, recommended: 2, optional: 1,
    })
  })

  it("counts come from the UNFILTERED set, so they don't all collapse to 0", () => {
    // The whole point: pick Essential, and the menu must still show how many
    // Recommended there are — otherwise it can't tell you where to go next.
    const c = tierFilterCounts(CORPUS, "all")
    expect(applyTierFilter(CORPUS, "essential", "all")).toHaveLength(1)
    expect(c.recommended).toBe(2)
  })

  it("each count matches what applying that filter actually returns", () => {
    const c = tierFilterCounts(CORPUS, "all")
    for (const o of TIER_FILTERS) {
      expect(applyTierFilter(CORPUS, o.value, "all").length, o.value).toBe(c[o.value])
    }
  })
})
