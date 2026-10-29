import { describe, it, expect } from "vitest"
import { Timestamp } from "firebase/firestore"
import { cadenceFactsFrom, completionDay, planFor } from "./cadenceChangeService"

/** The reads the cadence rule depends on: which day a completion was, and
 *  which occurrences are open. Pacific clock (vitest.config.ts). */
describe("completionDay", () => {
  it("a completeTask stamp (noon UTC of the day) is that day in every zone", () => {
    expect(completionDay(Timestamp.fromDate(new Date("2026-10-20T12:00:00Z")))).toBe("2026-10-20")
  })
  it("a logged instant is the device's day — 7 pm Pacific is not tomorrow", () => {
    expect(completionDay(Timestamp.fromDate(new Date("2026-10-21T02:00:00Z")))).toBe("2026-10-20")
  })
  it("anything else is no day", () => {
    expect(completionDay(null)).toBeNull()
    expect(completionDay("not a date")).toBeNull()
  })
})

describe("cadenceFactsFrom", () => {
  const tpl = {
    createdAt: Timestamp.fromDate(new Date("2026-03-02T18:00:00Z")),
    schedule: { scheduleType: "monthly", intervalDays: null, anchorDate: "2026-03-01", season: "fall" },
  }
  const inst = (id: string, data: Record<string, unknown>) => ({ id, data: { deletedAt: null, ...data } })

  it("reads the latest completion, the day added, and only the live open occurrences", () => {
    const f = cadenceFactsFrom(tpl, [
      inst("d1", { status: "done", completedAt: Timestamp.fromDate(new Date("2026-08-01T12:00:00Z")) }),
      inst("d2", { status: "done", completedAt: Timestamp.fromDate(new Date("2026-09-14T12:00:00Z")) }),
      inst("d3", { status: "done", completedAt: Timestamp.fromDate(new Date("2026-10-01T12:00:00Z")), deletedAt: new Date() }),
      inst("o1", { status: "snoozed", dueDate: "2026-10-14", snoozedUntil: "2026-10-30" }),
      inst("gone", { status: "scheduled", dueDate: "2026-10-14", deletedAt: new Date() }),
      inst("skip", { status: "skipped", dueDate: "2026-09-01" }),
    ], "2026-10-28")
    expect(f).toEqual({
      scheduleType: "monthly", intervalDays: null, season: "fall",
      lastDoneOn: "2026-09-14", addedOn: "2026-03-02",
      open: [{ id: "o1", status: "snoozed", dueDate: "2026-10-14", snoozedUntil: "2026-10-30" }],
    })
  })

  it("with no creation stamp, the schedule's anchor is the day added", () => {
    expect(cadenceFactsFrom({ schedule: { anchorDate: "2026-02-01" } }, [], "2026-10-28").addedOn).toBe("2026-02-01")
    expect(cadenceFactsFrom({}, [], "2026-10-28").addedOn).toBe("2026-10-28")
  })

  it("planFor uses the stored season when the editor gives none, and the editor's when it does", () => {
    const f = cadenceFactsFrom(tpl, [], "2026-10-28")
    expect(planFor(f, { scheduleType: "seasonal" }, "2026-10-28")).toMatchObject({ kind: "scheduled", nextDue: "2026-10-15" })
    expect(planFor(f, { scheduleType: "seasonal", season: "spring" }, "2026-10-28")).toMatchObject({ kind: "scheduled", nextDue: "2026-04-15" })
  })

  it("a stored 'last done' claim counts when it is later than the latest completion, never otherwise", () => {
    const done = [inst("d1", { status: "done", completedAt: Timestamp.fromDate(new Date("2026-09-14T12:00:00Z")) })]
    expect(cadenceFactsFrom({ ...tpl, lastDoneClaimedOn: "2026-10-01" }, done, "2026-10-28").lastDoneOn).toBe("2026-10-01")
    expect(cadenceFactsFrom({ ...tpl, lastDoneClaimedOn: "2026-08-01" }, done, "2026-10-28").lastDoneOn).toBe("2026-09-14")
    expect(cadenceFactsFrom({ ...tpl, lastDoneClaimedOn: "2026-08-01" }, [], "2026-10-28").lastDoneOn).toBe("2026-08-01")
  })
})
