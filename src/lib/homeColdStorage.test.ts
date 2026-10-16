/**
 * HH-166 on Home, which is where the owner reported it. Tasks' week agenda
 * already treated "Winterize Washer for Cold Storage" as as-needed in a
 * freeze-free home, but Home builds its own lists (this week + Coming up)
 * from the same instances and had no such filter. So in a mild home the washer
 * was gone from Tasks and still showing on Home. Both lists now apply the one
 * shared filter, gated on the profile Home already reads.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))

const { deriveDashboardTasks, deriveUpcomingTasks } = await import("./dashboard")
const { weekRows } = await import("./homeWeek")
const { localToday } = await import("../../shared/dates/calendar")
import type { HomeProfile } from "@/modules/home/services/homeProfileService"

const today = localToday()
const instance = (id: string, title: string) => ({
  id,
  data: {
    status: "scheduled", taskTemplateId: `tpl-${id}`, priorityTier: "recommended", priorityScore: 2,
    careType: "maintenance", scopeType: "item_unit", itemUnitId: "washer-1", itemName: "Washer", roomName: null,
    title, scheduleType: "seasonal", isSafetyCritical: false, estimatedMinutes: 20, deletedAt: null, dueDate: today,
  },
})
const LIVE = [
  instance("washer", "Winterize Washer for Cold Storage"),
  instance("pressure", "Winterize the pressure washer before storing it"),
]

function homeLists(profile: Partial<HomeProfile> | null) {
  const reads = { live: LIVE, recentDone: [], profile: profile as HomeProfile | null }
  const tasks = deriveDashboardTasks(reads)
  const upcoming = deriveUpcomingTasks(reads)
  return {
    thisWeek: weekRows([...tasks.overdue, ...tasks.dueSoon], upcoming, today).map((r) => r.id),
    upcoming: upcoming.map((t) => t.id),
  }
}

describe("Home's this-week and Coming-up lists — cold-storage winterizing", () => {
  it("a mild (freeze-free) home: the washer is absent from both; real autumn work stays", () => {
    const { thisWeek, upcoming } = homeLists({ climate: "mild", freeze_risk: false })
    expect(thisWeek).not.toContain("washer")
    expect(upcoming).not.toContain("washer")
    expect(thisWeek).toContain("pressure")
    expect(upcoming).toContain("pressure")
  })

  it("a home that freezes keeps it on both", () => {
    const { thisWeek, upcoming } = homeLists({ climate: "cold", freeze_risk: true })
    expect(thisWeek).toContain("washer")
    expect(upcoming).toContain("washer")
  })

  it("an unanswered — or unread — profile keeps it: nothing is hidden on a guess", () => {
    for (const profile of [{ climate: null, freeze_risk: null }, null]) {
      const { thisWeek, upcoming } = homeLists(profile)
      expect(thisWeek).toContain("washer")
      expect(upcoming).toContain("washer")
    }
  })
})
