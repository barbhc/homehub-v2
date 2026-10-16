/**
 * Snooze sticks (backlog "Snooze doesn't stick", H2 call 7).
 *
 * snoozeTaskInstance writes status "snoozed" + snoozedUntil and leaves dueDate
 * alone, and nothing flips it back. So on main:
 *  · Home read `scheduled` only — a task snoozed on Home NEVER came back;
 *  · the Tasks agenda read scheduled+snoozed without the date — a task
 *    snoozed on Tasks came back on the next refetch.
 * Both now read shared/tasks/snooze: hidden until snoozedUntil, then due from
 * that day. Each case reads the SAME stored rows at two instants.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getDocs = vi.fn()
const getDoc = vi.fn()

vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))
vi.mock("firebase/firestore", () => ({
  Timestamp: class {
    static fromDate(d: Date) {
      return { toDate: () => d }
    }
  },
  collection: vi.fn(() => ({})),
  collectionGroup: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: "new-doc" })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => "ts"),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  writeBatch: vi.fn(),
}))

import { getWeekAgenda } from "@/modules/care/services/weekAgenda"
import { deriveDashboardStats, deriveDashboardTasks, deriveUpcomingTasks } from "@/lib/dashboard"

/** Snoozed on Oct 15 for 14 days, from a due date of Oct 12 (overdue). */
const SNOOZED = {
  status: "snoozed", snoozedUntil: "2026-10-29", dueDate: "2026-10-12",
  taskTemplateId: "tpl-filter", priorityTier: "essential", careType: "maintenance", scopeType: "item_unit",
  itemUnitId: null, title: "Replace the furnace filter", scheduleType: "monthly", isSafetyCritical: false,
  estimatedMinutes: 10, itemName: null, roomName: null, deletedAt: null,
}

const at = (iso: string) => vi.setSystemTime(new Date(iso))
const DURING = "2026-10-16T09:00:00-07:00" // the day after the snooze
const AFTER = "2026-10-29T09:00:00-07:00" // the day it ends

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  getDocs.mockReset()
  getDoc.mockReset()
  getDoc.mockResolvedValue({ get: () => undefined, exists: () => true, data: () => ({}) })
  getDocs.mockResolvedValue({ metadata: { fromCache: false }, empty: false, docs: [{ id: "ti-1", data: () => SNOOZED }] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("Tasks — a task snoozed there stays away after a refetch, until its date", () => {
  it("is not on the agenda (or its calendar) while snoozed — however often it is read", async () => {
    at(DURING)
    for (let i = 0; i < 2; i++) {
      const res = await getWeekAgenda("h1", { days: 31 })
      expect(res.error).toBeNull()
      expect(res.data!.map((t) => t.taskInstanceId)).toEqual([])
      expect(res.withheld!.beyondHorizon).toBe(0)
    }
  })

  it("is back on the day the snooze ends, due THAT day — not 17 days overdue", async () => {
    at(AFTER)
    const res = await getWeekAgenda("h1", { days: 31 })
    expect(res.data!.map((t) => t.taskInstanceId)).toEqual(["ti-1"])
    expect(res.data![0].dueDate).toBe("2026-10-29")
    expect(res.data![0].pastDue).toBe(false)
  })
})

describe("Home — a task snoozed there comes back after its date", () => {
  const reads = { items: [], recentDone: [], live: [{ id: "ti-1", data: SNOOZED }] }
  const homeIds = () => [
    ...deriveDashboardTasks(reads).needsAttention.map((t) => t.id),
    ...deriveUpcomingTasks(reads).map((t) => t.id),
  ]

  it("is off Home while snoozed, but still counts as upkeep (no 'add a manual' prompt)", () => {
    at(DURING)
    expect(homeIds()).toEqual([])
    const stats = deriveDashboardStats({ ...reads, items: [] })
    expect(stats.dueSoonCount).toBe(0)
    expect(stats.overdueTaskCount).toBe(0)
    expect(stats.scheduledTaskCount).toBe(1)
  })

  it("is back on Home on the day the snooze ends, due today", () => {
    at(AFTER)
    expect(homeIds()).toContain("ti-1")
    const t = deriveDashboardTasks(reads).dueSoon.find((x) => x.id === "ti-1")
    expect(t?.dueDate).toBe("2026-10-29")
    expect(deriveDashboardStats({ ...reads, items: [] }).dueSoonCount).toBe(1)
  })
})
