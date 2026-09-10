/**
 * Home's one list — the derivation the stat band, the drawer and the
 * two week sections used to do four different ways (design/home-focus.md).
 */
import { describe, it, expect } from "vitest"
import { weekRows, nextUpRows, prepLine, timelyWarranty, isoDaysFrom } from "./homeWeek"
import type { DashboardTask, MaintenanceTaskFull } from "./dashboard"

const TODAY = "2026-09-07"

const urgent = (id: string, over: Partial<DashboardTask> = {}): DashboardTask =>
  ({
    id, name: `Task ${id}`, dueDate: "2026-09-01", isOverdue: true, isDueSoon: false, itemName: "Range Hood", itemId: "i1",
    priority: "high", effort: null, daysOverdue: 6, daysUntilDue: null, dueKind: "window", windowState: "lapsed",
    duePhrase: "Been a while", safetyNote: null, trulyOverdue: false, neverStarted: false, ...over,
  }) as unknown as DashboardTask

const ahead = (id: string, due: string, over: Partial<MaintenanceTaskFull> = {}): MaintenanceTaskFull =>
  ({ id, title: `Ahead ${id}`, next_due_date: due, item_id: "i2", itemName: "Washer", priority: "medium", duePhrase: "In Sep", isOverdue: false, ...over }) as unknown as MaintenanceTaskFull

describe("weekRows", () => {
  it("leads with the urgent feed, then the next seven days by date, each task once", () => {
    const rows = weekRows(
      [urgent("late"), urgent("today", { isOverdue: false, dueDate: TODAY, daysUntilDue: 0, duePhrase: "Good to do now" })],
      [ahead("d3", isoDaysFrom(TODAY, 3)), ahead("late", "2026-09-01"), ahead("d1", isoDaysFrom(TODAY, 1)), ahead("far", isoDaysFrom(TODAY, 20))],
      TODAY,
    )
    expect(rows.map((r) => r.id)).toEqual(["late", "today", "d1", "d3"])
  })

  it("caps the list — Home stays one screen; the footer is the door to the rest", () => {
    const many = Array.from({ length: 9 }, (_, i) => ahead(`a${i}`, isoDaysFrom(TODAY, 1 + (i % 6))))
    expect(weekRows([], many, TODAY)).toHaveLength(5)
    expect(weekRows([], many, TODAY, 3)).toHaveLength(3)
  })

  it("carries the calm vocabulary through: phrase, safety note, essential flag", () => {
    const [r] = weekRows([urgent("s", { priority: "critical", safetyNote: "Worth doing this week", duePhrase: "Been a while" })], [], TODAY)
    expect(r.essential).toBe(true)
    expect(r.safetyNote).toBe("Worth doing this week")
    expect(r.duePhrase).toBe("Been a while")
  })

  it("an empty window is an empty list, never a fabricated row", () => {
    expect(weekRows([], [ahead("far", isoDaysFrom(TODAY, 30))], TODAY)).toEqual([])
  })
})

describe("nextUpRows — the quiet week still points somewhere", () => {
  it("returns the next two beyond the window, soonest first", () => {
    const rows = nextUpRows([ahead("c", isoDaysFrom(TODAY, 30)), ahead("a", isoDaysFrom(TODAY, 9)), ahead("b", isoDaysFrom(TODAY, 12)), ahead("in", isoDaysFrom(TODAY, 2))], TODAY)
    expect(rows.map((r) => r.id)).toEqual(["a", "b"])
  })
})

describe("prepLine — one reminder, or nothing", () => {
  const base = { title: "Run Tub Clean Cycle", justification: null, notes: null, supplies: [] }
  it("names the one supply with an article", () => {
    expect(prepLine({ ...base, supplies: [{ name: "Affresh washer tablet" } as never] })).toBe("You'll need an Affresh washer tablet.")
    expect(prepLine({ ...base, supplies: [{ name: "16×25×1 furnace filter" } as never] })).toBe("You'll need 16×25×1 furnace filter.")
  })
  it("counts the rest instead of listing them", () => {
    expect(prepLine({ ...base, supplies: [{ name: "descaler" }, { name: "cloth" }, { name: "bowl" }] as never })).toBe("You'll need a descaler and 2 more.")
  })
  it("a pro task with nothing to buy says to book the visit", () => {
    expect(prepLine({ title: "Annual furnace service", justification: "A technician checks the heat exchanger and runs a combustion analysis.", notes: null, supplies: [] })).toBe("Schedule a visit with a technician.")
  })
  it("a plain DIY task with nothing to buy shows no line at all", () => {
    expect(prepLine({ title: "Wipe the door seal", justification: null, notes: null, supplies: [] })).toBeNull()
    expect(prepLine(null)).toBeNull()
  })
})

describe("timelyWarranty — one line, only when timely", () => {
  const w = (name: string, days: number) => ({ item_unit_id: name, display_name: name, warranty_expiry_date: isoDaysFrom(TODAY, days), days_remaining: days })
  it("picks the soonest inside 60 days and ignores the rest", () => {
    expect(timelyWarranty([w("Fridge", 80), w("Coway", 26), w("Washer", 45)])?.display_name).toBe("Coway")
  })
  it("nothing inside the window → null, so Home shows nothing", () => {
    expect(timelyWarranty([w("Fridge", 80)])).toBeNull()
    expect(timelyWarranty([])).toBeNull()
    expect(timelyWarranty([w("Lapsed", -3)])).toBeNull()
  })
})
