/**
 * Codex review D5 — changing "how often" must not reopen a completed task.
 *
 * Every cadence editor read the task's occurrences with a plain query and then
 * wrote the plan: `status: "scheduled"` and a new date on each occurrence the
 * query had seen open. A Done from another device that landed in between was
 * overwritten — the completed occurrence came back as scheduled, beside the
 * successor that completion had just created: two open occurrences and a
 * completion that never happened.
 *
 * The three editors (setTaskCadence/applyCadence, updateTaskSchedule,
 * saveItemTaskReview) now read the template and each open occurrence through
 * the transaction they write in. These tests land the other device's
 * completion — the Done and the next occurrence it mints, as completeTask
 * writes them — in each gap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } }, callable: vi.fn(() => vi.fn()) }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const { fakeDb, Timestamp } = await import("@/test/fakeFirestore")
const { setTaskCadence } = await import("./taskService")
const { updateTaskSchedule } = await import("./taskScheduleService")
const { saveItemTaskReview } = await import("./taskReviewService")
const { CADENCE_CHANGED_ELSEWHERE } = await import("./cadenceChangeService")

const HOME = "h1"
const TPL = `homes/${HOME}/taskTemplates/tpl-1`
const INSTANCES = `homes/${HOME}/taskInstances`
const OPEN = `${INSTANCES}/ti-1`
const NEXT = `${INSTANCES}/ti-2`

const template = {
  title: "Replace the furnace filter", itemUnitId: "furnace", careType: "maintenance", priorityTier: "recommended",
  riskLevel: "performance", estimatedMinutes: 10, isActive: true, deletedAt: null, manualId: null,
  createdAt: Timestamp.fromDate(new Date("2026-09-01T18:00:00Z")),
  schedule: { scheduleType: "monthly", intervalDays: null, season: null, anchorDate: "2026-09-01" },
}
const occurrence = (over: Record<string, unknown> = {}) => ({
  homeId: HOME, taskTemplateId: "tpl-1", itemUnitId: "furnace", title: template.title, status: "scheduled",
  dueDate: "2026-12-01", snoozedUntil: null, completedAt: null, deletedAt: null, scheduleType: "monthly", ...over,
})
const home = () => ({ [TPL]: template, [OPEN]: occurrence() })

/** What completeTask writes, from another device: this one done, the next one minted. */
function completeElsewhere() {
  // Noon UTC of the completion day — the server's own stamp (completionDay).
  fakeDb.write(OPEN, { status: "done", completedAt: Timestamp.fromDate(new Date("2026-11-22T12:00:00Z")) }, { merge: true })
  fakeDb.write(NEXT, occurrence({ dueDate: "2026-12-22" }))
}
/** Lands that completion once, right after the first read matching `what`. */
function completeAfter(what: string) {
  let landed = false
  fakeDb.afterRead = (read) => {
    if (landed || read !== what) return
    landed = true
    completeElsewhere()
  }
}
const stored = (path: string) => fakeDb.store.get(path)
const openOccurrences = () =>
  [...fakeDb.store.entries()].filter(([p, d]) => p.startsWith(`${INSTANCES}/`) && d.deletedAt == null && (d.status === "scheduled" || d.status === "snoozed"))

/** After any of the races: the Done stands, and exactly its successor is open, on the new cadence's date. */
function expectCompletionKept() {
  expect(stored(OPEN)).toMatchObject({ status: "done" })
  expect(stored(OPEN)!.completedAt).toBeInstanceOf(Timestamp)
  const open = openOccurrences()
  expect(open.map(([p]) => p)).toEqual([NEXT])
  // From when it was last done (Nov 22) + a week.
  expect(open[0][1]).toMatchObject({ status: "scheduled", dueDate: "2026-11-29", scheduleType: "weekly" })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-23T20:00:00Z") })
  fakeDb.load(home())
})

describe("setTaskCadence", () => {
  it("with nothing else going on, moves the open occurrence by the rule", async () => {
    const res = await setTaskCadence(HOME, "tpl-1", "weekly", null)
    expect(res.error).toBeNull()
    // Never done: the day it was added + a week.
    expect(stored(OPEN)).toMatchObject({ status: "scheduled", dueDate: "2026-09-08", scheduleType: "weekly" })
    expect(openOccurrences()).toHaveLength(1)
  })

  it("a completion that lands after the occurrences were queried is kept — the done one is not reopened", async () => {
    completeAfter(`query ${INSTANCES}`)
    const res = await setTaskCadence(HOME, "tpl-1", "weekly", null)
    expect(res.error).toBeNull()
    expectCompletionKept()
  })

  it("a completion that lands after the transaction read the occurrence is kept too", async () => {
    completeAfter(`get ${OPEN}`)
    const res = await setTaskCadence(HOME, "tpl-1", "weekly", null)
    expect(res.error).toBeNull()
    expectCompletionKept()
  })

  it("a task that keeps being completed mid-save fails with a plain message, and the schedule is not half-changed", async () => {
    // Every query is followed by another device completing the occurrence it
    // just saw open and minting the next one: no attempt sees a settled task.
    let n = 1
    fakeDb.afterRead = (read) => {
      if (read !== `query ${INSTANCES}`) return
      fakeDb.write(`${INSTANCES}/ti-${n}`, { status: "done", completedAt: Timestamp.fromDate(new Date("2026-11-22T12:00:00Z")) }, { merge: true })
      n++
      fakeDb.write(`${INSTANCES}/ti-${n}`, occurrence({ dueDate: "2026-12-22" }))
    }
    const res = await setTaskCadence(HOME, "tpl-1", "weekly", null)
    fakeDb.afterRead = null

    expect(res.error?.message).toBe(CADENCE_CHANGED_ELSEWHERE)
    // Nothing of this save landed: the template keeps its cadence, and no
    // completed occurrence was reopened or moved.
    expect(stored(TPL)).toMatchObject({ schedule: { scheduleType: "monthly" } })
    expect(openOccurrences().map(([p]) => p)).toEqual([`${INSTANCES}/ti-${n}`])
    expect(openOccurrences()[0][1]).toMatchObject({ dueDate: "2026-12-22", scheduleType: "monthly" })
  })
})

describe("updateTaskSchedule ('This isn't right')", () => {
  it("a completion that lands mid-save is kept", async () => {
    completeAfter(`query ${INSTANCES}`)
    const res = await updateTaskSchedule(HOME, "tpl-1", { schedule: { scheduleType: "weekly" } })
    expect(res.error).toBeNull()
    expectCompletionKept()
  })
})

describe("saveItemTaskReview (Review tasks)", () => {
  const review = () =>
    saveItemTaskReview({
      homeId: HOME,
      itemUnitId: "furnace",
      templateIds: ["tpl-1"],
      manualById: new Map(),
      shownTemplateIds: ["tpl-1"],
      chunks: [],
      tasks: [{
        template_id: "tpl-1", title: template.title, description: null, care_type: "maintenance", priority_tier: "recommended",
        remind_enabled: null, risk_level: "performance", estimated_minutes: 10, schedule_type: "weekly", interval_days: null,
        season: null, instructions_text: null, source_page: null, justification: null, symptom_tags: [], re_check_triggers: [],
      }],
    })

  it("a completion that lands mid-save is kept", async () => {
    completeAfter(`query ${INSTANCES}`)
    const res = await review()
    expect(res.error).toBeNull()
    expectCompletionKept()
  })

  it("a task dropped in the review does not take a just-completed occurrence with it", async () => {
    completeAfter(`query ${INSTANCES}`)
    const res = await saveItemTaskReview({
      homeId: HOME, itemUnitId: "furnace", templateIds: ["tpl-1"], manualById: new Map(), shownTemplateIds: ["tpl-1"], tasks: [], chunks: [],
    })
    expect(res.error).toBeNull()
    // The completion is history: never soft-deleted (non-negotiable 3).
    expect(stored(OPEN)).toMatchObject({ status: "done", deletedAt: null })
    expect(openOccurrences()).toEqual([])
  })
})
