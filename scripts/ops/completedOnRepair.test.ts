/**
 * The repair's date rule (completedOnRepair.ts). The CLI only reads and
 * writes; everything that decides whether a row is touched is here.
 *
 * Rows are built the way completeTask writes them: completedAt at noon UTC of
 * the day sent, updatedAt at the moment of the check-off.
 */
import { describe, expect, it } from "vitest"
import {
  SAME_TRANSACTION_MS,
  classifyCompletedRow,
  describeNextDue,
  findNextInstance,
  isCompleteTaskStamp,
  nextDueFrom,
  type SiblingFacts,
} from "./completedOnRepair.js"

const LA = "America/Los_Angeles"
const at = (iso: string) => new Date(iso)
const row = (completedOn: string, checkedOffAt: string | null, extra: { status?: string; deleted?: boolean } = {}) => ({
  status: extra.status ?? "done",
  deleted: extra.deleted ?? false,
  completedAt: at(`${completedOn}T12:00:00Z`),
  updatedAt: checkedOffAt ? at(checkedOffAt) : null,
})

describe("classifyCompletedRow — which rows the old UTC date shifted", () => {
  it("an evening check-off from the old client (UTC date sent) is shifted back to the home's day", () => {
    // Sep 29, 7:30 pm PDT: the old client sent the UTC date, Sep 30.
    expect(classifyCompletedRow(row("2026-09-30", "2026-09-30T02:30:00Z"), LA)).toEqual({
      kind: "shifted",
      recorded: "2026-09-30",
      corrected: "2026-09-29",
      checkedOffAt: at("2026-09-30T02:30:00Z"),
    })
  })

  it("a morning check-off never showed the bug", () => {
    expect(classifyCompletedRow(row("2026-09-29", "2026-09-29T16:00:00Z"), LA)).toEqual({ kind: "consistent", recorded: "2026-09-29" })
  })

  it("an evening check-off from the FIXED client is already right", () => {
    expect(classifyCompletedRow(row("2026-09-29", "2026-09-30T02:30:00Z"), LA).kind).toBe("consistent")
  })

  it("a repaired row reads as consistent, so a second run finds nothing", () => {
    // --apply moves completedAt and leaves updatedAt: the evidence still says Sep 29.
    expect(classifyCompletedRow(row("2026-09-29", "2026-09-30T02:30:00Z"), LA).kind).toBe("consistent")
  })

  it("'A few days ago' is left alone — the user chose that day", () => {
    // Old client at 7:30 pm PDT: UTC Sep 30 − 5 = Sep 25.
    expect(classifyCompletedRow(row("2026-09-25", "2026-09-30T02:30:00Z"), LA)).toEqual({
      kind: "unverifiable",
      recorded: "2026-09-25",
      lastWriteDay: "2026-09-29",
    })
  })

  it("a shifted row written again on a later day can't be proven — left alone", () => {
    expect(classifyCompletedRow(row("2026-09-30", "2026-10-03T18:00:00Z"), LA).kind).toBe("unverifiable")
    expect(classifyCompletedRow(row("2026-09-30", null), LA)).toEqual({ kind: "unverifiable", recorded: "2026-09-30", lastWriteDay: null })
  })

  it("a second write the same evening still carries the evidence", () => {
    // 10 pm PDT Sep 29 = 05:00Z Sep 30: still the UTC day it was recorded as, still Sep 29 at home.
    expect(classifyCompletedRow(row("2026-09-30", "2026-09-30T05:00:00Z"), LA)).toMatchObject({ kind: "shifted", corrected: "2026-09-29" })
  })

  it("a row CREATED done (logTaskCompletion) is left alone, even at 12:00Z from a UTC+0 device", () => {
    // London in winter logs "today" at 06:00: local noon IS 12:00Z, and LA is still Sep 29.
    const logged = {
      status: "done",
      deleted: false,
      completedAt: at("2026-09-30T12:00:00Z"),
      updatedAt: at("2026-09-30T06:00:00Z"),
      createdAt: at("2026-09-30T06:00:00Z"),
    }
    expect(classifyCompletedRow(logged, LA)).toEqual({ kind: "other-writer", recorded: "2026-09-30" })
    // The same stamp on an instance that existed before its check-off is completeTask's.
    expect(classifyCompletedRow({ ...logged, createdAt: at("2026-09-01T00:00:00Z") }, LA).kind).toBe("shifted")
  })

  it("rows not stamped at noon UTC were written by another path and are left alone", () => {
    const logged = { status: "done", deleted: false, completedAt: at("2026-09-29T19:00:00Z"), updatedAt: at("2026-09-30T02:30:00Z") }
    expect(classifyCompletedRow(logged, LA)).toEqual({ kind: "other-writer", recorded: "2026-09-29" })
    const seeded = { status: "done", deleted: false, completedAt: at("2026-09-19T17:00:00Z"), updatedAt: at("2026-09-29T00:00:00Z") }
    expect(classifyCompletedRow(seeded, LA).kind).toBe("other-writer")
    expect(isCompleteTaskStamp(at("2026-09-29T12:00:00.001Z"))).toBe(false)
  })

  it("open and soft-deleted rows are not candidates", () => {
    expect(classifyCompletedRow(row("2026-09-30", "2026-09-30T02:30:00Z", { status: "scheduled" }), LA).kind).toBe("not-completed")
    expect(classifyCompletedRow({ status: "done", deleted: false, completedAt: null, updatedAt: null }, LA).kind).toBe("not-completed")
    expect(classifyCompletedRow(row("2026-09-30", "2026-09-30T02:30:00Z", { deleted: true }), LA).kind).toBe("deleted")
  })

  it("east of UTC the shift runs the other way (Tokyo: recorded the day BEFORE)", () => {
    // 8 am JST Sep 30 = 23:00Z Sep 29: the old client sent Sep 29.
    expect(classifyCompletedRow(row("2026-09-29", "2026-09-29T23:00:00Z"), "Asia/Tokyo")).toMatchObject({
      kind: "shifted",
      recorded: "2026-09-29",
      corrected: "2026-09-30",
    })
  })

  it("standard time and a month end: 9 pm PST Nov 30 was recorded as Dec 1", () => {
    expect(classifyCompletedRow(row("2026-12-01", "2026-12-01T05:00:00Z"), LA)).toMatchObject({
      kind: "shifted",
      recorded: "2026-12-01",
      corrected: "2026-11-30",
    })
  })
})

describe("nextDueFrom — completeTask's cadence from a completion day", () => {
  it.each([
    [{ scheduleType: "monthly" }, "2026-09-30", "2026-10-30"],
    [{ scheduleType: "weekly" }, "2026-09-30", "2026-10-07"],
    [{ scheduleType: "every_n_days", intervalDays: 10 }, "2026-09-30", "2026-10-10"],
    [{ scheduleType: "seasonal", season: "fall" }, "2026-09-29", "2026-10-15"],
    [{ scheduleType: "seasonal", season: "fall" }, "2026-10-15", "2027-10-15"],
    [{ scheduleType: "as_needed" }, "2026-09-30", null],
    [{ scheduleType: "seasonal" }, "2026-09-30", null],
  ])("%j from %s → %s", (schedule, day, expected) => {
    expect(nextDueFrom(day, schedule)).toBe(expected)
  })

  it("no schedule, no next due", () => {
    expect(nextDueFrom("2026-09-30", null)).toBeNull()
    expect(nextDueFrom("2026-09-30", undefined)).toBeNull()
  })
})

describe("findNextInstance + describeNextDue — the instance minted with the check-off", () => {
  const CHECKED_OFF = at("2026-09-30T02:30:00Z")
  const sib = (id: string, over: Partial<SiblingFacts>): SiblingFacts => ({
    id,
    taskTemplateId: "t1",
    createdAt: at("2026-09-30T02:30:00.040Z"),
    dueDate: "2026-10-30",
    status: "scheduled",
    deleted: false,
    ...over,
  })

  it("matches the same template's instance created in the same transaction — and nothing else", () => {
    const next = sib("next", {})
    const siblings = [
      sib("done", { createdAt: at("2026-09-01T00:00:00Z") }), // the completed row itself
      next,
      sib("other-template", { taskTemplateId: "t2" }),
      sib("an-hour-later", { createdAt: at("2026-09-30T03:30:00Z") }),
      sib("no-created-at", { createdAt: null }),
    ]
    expect(findNextInstance(siblings, "t1", "done", CHECKED_OFF)).toBe(next)
    expect(findNextInstance([sib("late", { createdAt: new Date(CHECKED_OFF.getTime() + SAME_TRANSACTION_MS + 1) })], "t1", "done", CHECKED_OFF)).toBeNull()
  })

  it("a due date exactly one cadence from the shifted day was DERIVED from it", () => {
    expect(describeNextDue(sib("next", {}), "2026-09-30", "2026-09-29", { scheduleType: "monthly" })).toEqual({
      kind: "derived",
      nextId: "next",
      dueDate: "2026-10-30",
      correctedDueDate: "2026-10-29",
      status: "scheduled",
      deleted: false,
    })
  })

  it("an adjusted (+1 week) or rolled due date is not attributed to the shift", () => {
    expect(describeNextDue(sib("next", { dueDate: "2026-11-06" }), "2026-09-30", "2026-09-29", { scheduleType: "monthly" })).toMatchObject({
      kind: "not-derived",
      fromRecorded: "2026-10-30",
    })
  })

  it("no minted instance → nothing to report", () => {
    expect(describeNextDue(null, "2026-09-30", "2026-09-29", { scheduleType: "monthly" })).toEqual({ kind: "none" })
  })
})
