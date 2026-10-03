/**
 * "Which day is it?" — every surface answers with the DEVICE's calendar day.
 *
 * The users are in US zones. From ~5 pm Pacific the UTC date is already
 * tomorrow, and the client cut "today" from the UTC clock in a dozen places,
 * so every evening: windows closed a day early, a deadline due today read
 * "Overdue", tomorrow's task read "Today", the week ran a day long, and a new
 * weekly schedule started a day late (shared/dates/calendar.ts is the fix).
 *
 * Every block runs ONE fixture at two instants, on the Pacific clock the suite
 * is pinned to (vitest.config.ts):
 *
 *   19:30 PDT, Sep 30 — UTC is 02:30 on Oct 1. The UTC cut was wrong here.
 *   00:30 PDT, Oct 1  — UTC is 07:30 on Oct 1, the same date. This side pins
 *                       that the day DOES turn at local midnight, so the pair
 *                       brackets the boundary: the same task reads "today" at
 *                       19:30 and "yesterday" five hours later, never sooner.
 *
 * The last block is the DST half: the replaced day arithmetic lost a day
 * across spring-forward, at any hour.
 *
 * Only functions that predate the calendar module are imported, so this file
 * runs unchanged against the old code and fails there (the PR lists which).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getDocs = vi.fn()
const getDoc = vi.fn()
/** Every document a batch wrote, in order. */
const batchSet = vi.fn()

// weekAgenda → taskService builds its callables at module scope.
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
  writeBatch: vi.fn(() => {
    const batch = {
      set: (...a: unknown[]) => {
        batchSet(...a)
        return batch
      },
      commit: vi.fn(async () => {}),
    }
    return batch
  }),
}))
vi.mock("@/hooks/usePushMode", () => ({ usePushMode: () => ({ mode: "curated", prefs: {} }) }))

import { derivedDue, dueWindow, isTrulyOverdue, safetyPhrase, windowPhrase } from "@/lib/dueWindow"
import { seasonalWindow } from "../../shared/care/seasonalWindow"
import { whenLabel } from "@/components/home/tasks/shared"
import { weekChip } from "@/hooks/useWeekReminders"
import { cleanDueLabel, daysUntilDue } from "@/lib/cleanDue"
import { computeCleanScore } from "@/lib/cleanSession"
import { plannedInstanceDue } from "@/modules/care/services/scheduleService"
import { computePriorityScore, logTaskCompletion } from "@/modules/care/services/taskService"
import { getWeekAgenda, type WeekAgendaItem } from "@/modules/care/services/weekAgenda"
import { deriveDashboardStats, deriveDashboardTasks } from "@/lib/dashboard"

const EVENING = { at: "2026-09-30T19:30:00-07:00", label: "19:30 PDT Sep 30 (UTC: Oct 1)" }
const AFTER_MIDNIGHT = { at: "2026-10-01T00:30:00-07:00", label: "00:30 PDT Oct 1" }

function at(instant: string) {
  vi.setSystemTime(new Date(instant))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  getDocs.mockReset()
  getDoc.mockReset()
  batchSet.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

it("the clock these cases need: Pacific, where 19:30 is already tomorrow in UTC", () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles")
  at(EVENING.at)
  expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-01") // what the old "today" was
  expect(new Date().getDate()).toBe(30)
})

/** A WeekAgendaItem for the label helpers — only the fields they read matter. */
const row = (over: Partial<WeekAgendaItem>): WeekAgendaItem => ({
  taskInstanceId: "ti", taskTemplateId: "tt", title: "Replace the furnace filter", source: "appliance",
  priorityTier: "recommended", estimatedMinutes: 10, dueDate: "2026-09-30", isOverdue: false, pastDue: false,
  dueKind: "window", windowState: "open", duePhrase: "", safetyNote: null, trulyOverdue: false,
  itemUnitId: null, itemName: null, roomName: null, ...over,
})

describe("today — which day the labels count from", () => {
  it(`${EVENING.label}: a task due tomorrow says Tomorrow, and today's row is still this week's`, () => {
    at(EVENING.at)
    expect(whenLabel(row({ dueDate: "2026-10-01" }))).toBe("Tomorrow")
    expect(whenLabel(row({ dueDate: "2026-10-02" }))).toBe("In 2 days")
    expect(weekChip({ dueDate: "2026-09-30", duePhrase: "Been a while" })).toBe("Wed")
  })

  it(`${AFTER_MIDNIGHT.label}: the same task now says Today; Sep 30's row is past`, () => {
    at(AFTER_MIDNIGHT.at)
    expect(whenLabel(row({ dueDate: "2026-10-01" }))).toBe("Today")
    expect(whenLabel(row({ dueDate: "2026-10-02" }))).toBe("Tomorrow")
    expect(weekChip({ dueDate: "2026-09-30", duePhrase: "Been a while" })).toBe("Been a while")
  })
})

describe("a setup step checked off now (logTaskCompletion) — filed under the device's day", () => {
  async function checkOffNow() {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ title: "Level the dishwasher", schedule: { scheduleType: "setup" } }) })
    const res = await logTaskCompletion("h1", "tpl-level", "item-1", new Date().toISOString())
    expect(res.error).toBeNull()
    return (batchSet.mock.calls[0][1] as { dueDate: string }).dueDate
  }

  it(`${EVENING.label}: Sep 30`, async () => {
    at(EVENING.at)
    expect(await checkOffNow()).toBe("2026-09-30")
  })

  it(`${AFTER_MIDNIGHT.label}: Oct 1`, async () => {
    at(AFTER_MIDNIGHT.at)
    expect(await checkOffNow()).toBe("2026-10-01")
  })
})

describe("due windows (dueWindow.ts) — judged against the device's day", () => {
  // Weekly = ±2 days: due Sep 28 → window Sep 26–30; due Oct 3 → Oct 1–5.
  it(`${EVENING.label}: a window closing today is still open; one opening tomorrow hasn't opened`, () => {
    at(EVENING.at)
    expect(dueWindow("2026-09-28", "weekly").state).toBe("open")
    expect(windowPhrase("2026-09-28", "weekly")).toBe("This week")
    expect(dueWindow("2026-10-03", "weekly").state).toBe("upcoming")
    expect(windowPhrase("2026-10-03", "weekly")).toBe("In Oct")
    // Safety work whose monthly window (Sep 16–30) closes tonight hasn't skipped a cycle yet.
    expect(safetyPhrase("2026-09-23", "monthly")).toBeNull()
  })

  it(`${AFTER_MIDNIGHT.label}: the first has lapsed, the second is open`, () => {
    at(AFTER_MIDNIGHT.at)
    expect(dueWindow("2026-09-28", "weekly").state).toBe("lapsed")
    expect(windowPhrase("2026-09-28", "weekly")).toBe("Been a while")
    expect(dueWindow("2026-10-03", "weekly").state).toBe("open")
    expect(windowPhrase("2026-10-03", "weekly")).toBe("This week")
    expect(safetyPhrase("2026-09-23", "monthly")).toBe("Monthly check · skipped September")
  })
})

describe("seasonal windows — the season opens on the device's month", () => {
  // A mild-climate fall job runs Oct–Nov.
  it(`${EVENING.label}: still September, so not yet in season`, () => {
    at(EVENING.at)
    expect(seasonalWindow("fall", "mild").open).toBe(false)
  })

  it(`${AFTER_MIDNIGHT.label}: October, in season`, () => {
    at(AFTER_MIDNIGHT.at)
    expect(seasonalWindow("fall", "mild").open).toBe(true)
  })
})

describe("overdue and due-today labels — a deadline is due through its whole day", () => {
  const DEADLINE = { title: "Register the dishwasher warranty", scheduleType: "as_needed", dueDate: "2026-09-30" }

  it(`${EVENING.label}: due today — not overdue`, () => {
    at(EVENING.at)
    expect(isTrulyOverdue("2026-09-30", "deadline")).toBe(false)
    expect(derivedDue(DEADLINE)).toMatchObject({ dueKind: "deadline", duePhrase: "By Sep 30", trulyOverdue: false })
  })

  it(`${AFTER_MIDNIGHT.label}: now it is`, () => {
    at(AFTER_MIDNIGHT.at)
    expect(isTrulyOverdue("2026-09-30", "deadline")).toBe(true)
    expect(derivedDue(DEADLINE)).toMatchObject({ dueKind: "deadline", trulyOverdue: true })
  })
})

describe("next-due computation — a new cadence counts from the device's today", () => {
  it(`${EVENING.label}: weekly → Oct 7, monthly → Oct 30`, () => {
    at(EVENING.at)
    expect(plannedInstanceDue("tt", { scheduleType: "weekly" })).toBe("2026-10-07")
    expect(plannedInstanceDue("tt", { scheduleType: "monthly" })).toBe("2026-10-30")
    expect(plannedInstanceDue("tt", { scheduleType: "every_n_days", intervalDays: 90 })).toBe("2026-12-29")
  })

  it(`${AFTER_MIDNIGHT.label}: a day later, a day later`, () => {
    at(AFTER_MIDNIGHT.at)
    expect(plannedInstanceDue("tt", { scheduleType: "weekly" })).toBe("2026-10-08")
    expect(plannedInstanceDue("tt", { scheduleType: "monthly" })).toBe("2026-10-31")
    expect(plannedInstanceDue("tt", { scheduleType: "every_n_days", intervalDays: 90 })).toBe("2026-12-30")
  })
})

describe("the week agenda (getWeekAgenda) — today's row and the week's edge", () => {
  const instance = (id: string, over: Record<string, unknown>) => ({
    id,
    data: () => ({
      status: "scheduled", taskTemplateId: `tpl-${id}`, priorityTier: "essential", careType: "maintenance",
      scopeType: "item_unit", itemUnitId: null, title: id, scheduleType: "monthly", isSafetyCritical: false,
      estimatedMinutes: 10, itemName: null, roomName: null, deletedAt: null, ...over,
    }),
  })
  const INSTANCES = [
    instance("deadline", { title: "Register the dishwasher warranty", scheduleType: "as_needed", dueDate: "2026-09-30" }),
    instance("weekly", { title: "Wipe the range hood", scheduleType: "weekly", dueDate: "2026-09-28" }),
    instance("day7", { title: "Test the sump pump", dueDate: "2026-10-07" }),
    instance("day8", { title: "Flush the water heater", dueDate: "2026-10-08" }),
  ]
  async function agenda() {
    getDoc.mockResolvedValue({ get: () => undefined, exists: () => true, data: () => ({}) })
    getDocs.mockResolvedValue({ metadata: { fromCache: false }, empty: false, docs: INSTANCES })
    const res = await getWeekAgenda("h1")
    if (!res.data) throw new Error(res.error?.message ?? "no agenda")
    const byId = Object.fromEntries(res.data.map((r) => [r.taskInstanceId, r]))
    return { byId, ids: res.data.map((r) => r.taskInstanceId), withheld: res.withheld }
  }

  it(`${EVENING.label}: the deadline due today is today's, not overdue; the week ends Oct 7`, async () => {
    at(EVENING.at)
    const { byId, ids, withheld } = await agenda()
    expect(byId.deadline).toMatchObject({ pastDue: false, isOverdue: false, trulyOverdue: false, duePhrase: "By Sep 30" })
    expect(byId.weekly).toMatchObject({ pastDue: true, windowState: "open", duePhrase: "This week" })
    expect(ids).toContain("day7")
    expect(ids).not.toContain("day8")
    expect(withheld).toMatchObject({ beyondHorizon: 1, nextDueDate: "2026-10-08" })
  })

  it(`${AFTER_MIDNIGHT.label}: the deadline is now past; the week reaches Oct 8`, async () => {
    at(AFTER_MIDNIGHT.at)
    const { byId, ids, withheld } = await agenda()
    expect(byId.deadline).toMatchObject({ pastDue: true, trulyOverdue: true })
    expect(byId.weekly).toMatchObject({ windowState: "lapsed", duePhrase: "Been a while" })
    expect(ids).toEqual(expect.arrayContaining(["day7", "day8"]))
    expect(withheld).toMatchObject({ beyondHorizon: 0, nextDueDate: null })
  })
})

describe("clean-due logic (the Deep Clean hub)", () => {
  const clean = (dueDate: string) => ({ title: "Wipe the fridge gaskets", dueDate, scheduleType: "monthly", isOverdue: false })
  const scored = {
    id: "c1", source: "instance" as const, title: "Descale the kettle", description: null, instructions: null,
    itemUnitId: null, itemName: null, roomId: null, roomName: null, dueDate: "2026-09-29", estimatedMinutes: 10,
    scheduleType: "monthly", lastCompletedDate: null, staleDays: 0, isOverdue: true,
  }

  it(`${EVENING.label}: tomorrow's clean says Tomorrow; yesterday's is one day late`, () => {
    at(EVENING.at)
    expect(cleanDueLabel(clean("2026-10-01")).text).toBe("Tomorrow")
    expect(cleanDueLabel(clean("2026-09-30")).text).toBe("Today")
    expect(daysUntilDue("2026-09-30")).toBe(0)
    expect(computeCleanScore(scored)).toBe(1 * 4 + 20) // one overdue day, monthly urgency
  })

  it(`${AFTER_MIDNIGHT.label}: it is today's, and yesterday's is two days late`, () => {
    at(AFTER_MIDNIGHT.at)
    expect(cleanDueLabel(clean("2026-10-01")).text).toBe("Today")
    expect(daysUntilDue("2026-09-30")).toBe(-1)
    expect(computeCleanScore(scored)).toBe(2 * 4 + 20)
  })
})

describe("DST — Home's due-soon week across spring-forward (Mar 8 2026)", () => {
  // Due soon = due today through today + 7. The replaced arithmetic counted
  // the week a day short whenever it crossed the jump, at any hour.
  const live = (id: string, dueDate: string) => ({
    id,
    data: {
      status: "scheduled", dueDate, taskTemplateId: `tpl-${id}`, priorityTier: "recommended", careType: "maintenance",
      scopeType: "item_unit", scheduleType: "monthly", title: id, itemUnitId: null, deletedAt: null,
    },
  })
  const reads = { items: [], recentDone: [], live: [live("mar11", "2026-03-11"), live("mar12", "2026-03-12"), live("mar13", "2026-03-13")] }
  const soonIds = () => deriveDashboardTasks(reads).dueSoon.map((t) => t.id).sort()

  it("19:30 PST Mar 4: the week runs to Mar 11", () => {
    at("2026-03-04T19:30:00-08:00")
    expect(soonIds()).toEqual(["mar11"])
    expect(deriveDashboardStats(reads).dueSoonCount).toBe(1)
  })

  it("00:30 PST Mar 5: the week runs to Mar 12", () => {
    at("2026-03-05T00:30:00-08:00")
    expect(soonIds()).toEqual(["mar11", "mar12"])
    expect(deriveDashboardStats(reads).dueSoonCount).toBe(2)
  })
})

describe("a new instance's priority (computePriorityScore) — calendar days from the device's today", () => {
  // +60 once past due; +15 when due within 14 days. The 14 days were 14 × 24 h
  // from local noon, which across the 25-hour fall-back day stops at 11:00 on
  // day 14 — short of a task due that day (at noon).
  const score = (due: string) => computePriorityScore("recommended", "performance", due, null, null, 10).priorityScore
  const BASE = 60 + 20 // recommended + performance
  const OVERDUE = BASE + 60
  const SOON = BASE + 15

  it(`${EVENING.label}: due today is soon, not overdue; day 14 is Oct 14`, () => {
    at(EVENING.at)
    expect(score("2026-09-30")).toBe(SOON)
    expect(score("2026-10-14")).toBe(SOON)
    expect(score("2026-10-15")).toBe(BASE)
  })

  it(`${AFTER_MIDNIGHT.label}: Sep 30 is past due; day 14 is Oct 15`, () => {
    at(AFTER_MIDNIGHT.at)
    expect(score("2026-09-30")).toBe(OVERDUE)
    expect(score("2026-10-15")).toBe(SOON)
    expect(score("2026-10-16")).toBe(BASE)
  })

  it("00:30 PDT Oct 26 (DST): across the fall-back day, day 14 is still Nov 9", () => {
    at("2026-10-26T00:30:00-07:00")
    expect(score("2026-11-09")).toBe(SOON)
    expect(score("2026-11-10")).toBe(BASE)
  })
})
