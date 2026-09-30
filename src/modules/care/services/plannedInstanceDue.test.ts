/**
 * plannedInstanceDue lets a caller that already holds a template skip
 * generateTaskInstances — and the template read it starts with — when there is
 * nothing to create. That is only safe if the two ALWAYS agree, so every
 * cadence is run through both against the same template.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { fakeDb } = await import("@/test/fakeFirestore")
const { plannedInstanceDue, generateTaskInstances } = await import("./scheduleService")

const HOME = "h1"
const TODAY = "2026-06-23"

type Schedule = Record<string, unknown> | null
const schedule = (scheduleType: string, over: Record<string, unknown> = {}): Schedule => ({
  scheduleType, intervalDays: null, anchorDate: null, season: null, windowDaysBefore: 7, windowDaysAfter: 14, ...over,
})

const cases: Array<[string, Schedule, string | null]> = [
  ["as needed", schedule("as_needed"), null],
  ["after each use", schedule("after_each_use"), null],
  ["setup", schedule("setup"), null],
  ["weekly", schedule("weekly"), "2026-06-30"],
  ["monthly", schedule("monthly"), "2026-07-23"],
  ["quarterly", schedule("quarterly"), "2026-09-21"],
  ["semiannual", schedule("semiannual"), "2026-12-20"],
  ["annual, no anchor", schedule("annual"), "2027-06-23"],
  ["annual, anchor already past", schedule("annual", { anchorDate: "2026-01-05" }), null],
  ["annual, anchor ahead", schedule("annual", { anchorDate: "2026-11-01" }), "2026-11-01"],
  ["every 10 days", schedule("every_n_days", { intervalDays: 10 }), "2026-07-03"],
  ["every n days, no interval", schedule("every_n_days"), null],
  ["seasonal, fall", schedule("seasonal", { season: "fall" }), "2026-10-15"],
  ["seasonal, spring (already past this year)", schedule("seasonal", { season: "spring" }), null],
  ["seasonal, no season", schedule("seasonal"), null],
  ["no schedule at all", null, null],
]

describe("plannedInstanceDue", () => {
  beforeEach(() => fakeDb.load({}))

  it.each(cases)("%s → the date generateTaskInstances creates, or none", async (_label, sched, expected) => {
    const id = "tpl-x"
    fakeDb.load({
      [`homes/${HOME}/taskTemplates/${id}`]: { title: "X", priorityTier: "recommended", careType: "cleaning", isActive: true, deletedAt: null, schedule: sched },
    })
    expect(plannedInstanceDue(id, sched, TODAY)).toBe(expected)

    const res = await generateTaskInstances({ home_id: HOME, task_template_id: id, from_date: TODAY })
    const created = fakeDb.writes.filter((w) => w.path.startsWith(`homes/${HOME}/taskInstances/`))
    if (expected === null) {
      expect(created).toEqual([])
      expect(res.data?.count ?? 0).toBe(0)
    } else {
      expect(res).toEqual({ data: { count: 1 }, error: null })
      expect(created.map((w) => w.data.dueDate)).toEqual([expected])
    }
  })
})
