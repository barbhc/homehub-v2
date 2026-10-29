import { describe, it, expect } from "vitest"
import { cadenceChanged, planCadenceChange, seasonalAfter, type CadenceChangeInput, type OpenOccurrence } from "./cadenceChange"

/**
 * The owner's rule (2026-10-28): "From when you last did it." Each case is one
 * line of the decision, stated as the requirement and checked as a date.
 */
const TODAY = "2026-10-28"
const open = (over: Partial<OpenOccurrence> = {}): OpenOccurrence => ({
  id: "i-open", status: "scheduled", dueDate: "2026-11-20", snoozedUntil: null, ...over,
})
const plan = (over: Partial<CadenceChangeInput>) =>
  planCadenceChange({
    scheduleType: "monthly", intervalDays: null, season: null,
    lastDoneOn: null, addedOn: "2026-01-10", open: [open()], today: TODAY,
    ...over,
  })
const scheduled = (p: ReturnType<typeof plan>) => {
  if (p.kind !== "scheduled") throw new Error(`expected a date, got ${p.kind}`)
  return p
}

describe("planCadenceChange — next due = last completion + new cadence", () => {
  it("monthly → quarterly counts three months from the last completion, and moves the open occurrence there", () => {
    const p = scheduled(plan({ scheduleType: "quarterly", lastDoneOn: "2026-10-01" }))
    expect(p.nextDue).toBe("2027-01-01")
    expect(p.basis).toBe("last-done")
    expect(p.overdue).toBe(false)
    expect(p.moves).toEqual([{ id: "i-open", dueDate: "2027-01-01", status: "scheduled", snoozedUntil: null }])
    expect(p.create).toBe(false)
  })

  it("quarterly → monthly counts one month from the last completion", () => {
    expect(scheduled(plan({ scheduleType: "monthly", lastDoneOn: "2026-10-05" })).nextDue).toBe("2026-11-05")
  })

  it("monthly → every 2 weeks, done recently: two weeks after that completion", () => {
    const p = scheduled(plan({ scheduleType: "every_n_days", intervalDays: 14, lastDoneOn: "2026-10-20" }))
    expect(p.nextDue).toBe("2026-11-03")
    expect(p.overdue).toBe(false)
  })

  it("monthly → every 2 weeks, done long ago: the date is in the past and is honestly overdue", () => {
    const p = scheduled(plan({ scheduleType: "every_n_days", intervalDays: 14, lastDoneOn: "2026-06-01" }))
    expect(p.nextDue).toBe("2026-06-15")
    expect(p.overdue).toBe(true)
  })

  it("monthly → every 2 weeks, never done: counts from the day the task was added", () => {
    const p = scheduled(plan({ scheduleType: "every_n_days", intervalDays: 14, lastDoneOn: null, addedOn: "2026-10-20" }))
    expect(p.nextDue).toBe("2026-11-03")
    expect(p.basis).toBe("added")
  })

  it("never done and added long ago: past, and overdue rather than quietly re-based on today", () => {
    const p = scheduled(plan({ scheduleType: "quarterly", lastDoneOn: null, addedOn: "2026-01-10" }))
    expect(p.nextDue).toBe("2026-04-10")
    expect(p.overdue).toBe(true)
  })

  it("an every-N-days interval that is not a positive whole number falls back to 30 days, as the server does", () => {
    expect(scheduled(plan({ scheduleType: "every_n_days", intervalDays: null, lastDoneOn: "2026-10-01" })).nextDue).toBe("2026-10-31")
    expect(scheduled(plan({ scheduleType: "every_n_days", intervalDays: 0, lastDoneOn: "2026-10-01" })).nextDue).toBe("2026-10-31")
  })
})

describe("planCadenceChange — seasonal uses the season, and asks when it is unknown", () => {
  it("with a known season: that season's next window after the last completion", () => {
    expect(scheduled(plan({ scheduleType: "seasonal", season: "fall", lastDoneOn: "2026-10-20" })).nextDue).toBe("2027-10-15")
    expect(scheduled(plan({ scheduleType: "seasonal", season: "spring", lastDoneOn: "2026-10-20" })).nextDue).toBe("2027-04-15")
  })

  it("a season last done a year ago is due this season — past, so overdue", () => {
    const p = scheduled(plan({ scheduleType: "seasonal", season: "fall", lastDoneOn: "2025-10-20" }))
    expect(p.nextDue).toBe("2026-10-15")
    expect(p.overdue).toBe(true)
  })

  it("with no season: needs-season — no date, no guess, no ten-years-out parking", () => {
    expect(plan({ scheduleType: "seasonal", season: null }).kind).toBe("needs-season")
    expect(plan({ scheduleType: "seasonal", season: "monsoon" }).kind).toBe("needs-season")
  })

  it("done on the season's anchor day itself is due the next year", () => {
    expect(seasonalAfter("fall", "2026-10-15")).toBe("2027-10-15")
    expect(seasonalAfter("winter", "2026-10-28")).toBe("2027-01-15")
  })
})

describe("planCadenceChange — as needed / setup remove the open occurrence", () => {
  for (const scheduleType of ["as_needed", "setup", "after_each_use"] as const) {
    it(`${scheduleType}: removes every open occurrence, scheduled or snoozed`, () => {
      const p = plan({ scheduleType, open: [open(), open({ id: "i-snz", status: "snoozed", snoozedUntil: "2026-12-01" })] })
      expect(p).toEqual({ kind: "unscheduled", remove: ["i-open", "i-snz"] })
    })
  }

  it("with nothing open there is nothing to remove", () => {
    expect(plan({ scheduleType: "as_needed", open: [] })).toEqual({ kind: "unscheduled", remove: [] })
  })
})

describe("planCadenceChange — snoozes", () => {
  it("a snooze that ends AFTER the new date is kept", () => {
    const p = scheduled(plan({ scheduleType: "monthly", lastDoneOn: "2026-10-10", open: [open({ status: "snoozed", snoozedUntil: "2026-11-30" })] }))
    expect(p.nextDue).toBe("2026-11-10")
    expect(p.moves).toEqual([{ id: "i-open", dueDate: "2026-11-10", status: "snoozed", snoozedUntil: "2026-11-30" }])
  })

  it("a snooze that ends before the new date is dropped", () => {
    const p = scheduled(plan({ scheduleType: "quarterly", lastDoneOn: "2026-10-10", open: [open({ status: "snoozed", snoozedUntil: "2026-11-01" })] }))
    expect(p.moves).toEqual([{ id: "i-open", dueDate: "2027-01-10", status: "scheduled", snoozedUntil: null }])
  })

  it("a snooze ending ON the new date is dropped (it is not later)", () => {
    const p = scheduled(plan({ scheduleType: "monthly", lastDoneOn: "2026-10-10", open: [open({ status: "snoozed", snoozedUntil: "2026-11-10" })] }))
    expect(p.moves[0]).toMatchObject({ status: "scheduled", snoozedUntil: null })
  })

  it("a snoozed row with no usable snooze date is scheduled on the new date", () => {
    const p = scheduled(plan({ scheduleType: "monthly", lastDoneOn: "2026-10-10", open: [open({ status: "snoozed", snoozedUntil: null })] }))
    expect(p.moves[0]).toMatchObject({ status: "scheduled", snoozedUntil: null, dueDate: "2026-11-10" })
  })
})

describe("planCadenceChange — a task with no occurrence", () => {
  it("gets one on the computed date", () => {
    const p = scheduled(plan({ scheduleType: "monthly", lastDoneOn: "2026-10-10", open: [] }))
    expect(p).toMatchObject({ nextDue: "2026-11-10", moves: [], create: true })
  })

  it("seasonal with no season still asks rather than creating one", () => {
    expect(plan({ scheduleType: "seasonal", open: [] }).kind).toBe("needs-season")
  })
})

describe("cadenceChanged — only a real change moves a date", () => {
  it("same cadence is not a change", () => {
    expect(cadenceChanged({ scheduleType: "monthly", intervalDays: null }, { scheduleType: "monthly", intervalDays: null })).toBe(false)
  })
  it("a different cadence is", () => {
    expect(cadenceChanged({ scheduleType: "monthly" }, { scheduleType: "quarterly" })).toBe(true)
  })
  it("every N days with a new N is; with the same N it is not", () => {
    expect(cadenceChanged({ scheduleType: "every_n_days", intervalDays: 14 }, { scheduleType: "every_n_days", intervalDays: 21 })).toBe(true)
    expect(cadenceChanged({ scheduleType: "every_n_days", intervalDays: 14 }, { scheduleType: "every_n_days", intervalDays: 14 })).toBe(false)
  })
  it("a new season on a seasonal task is; no season given is not", () => {
    expect(cadenceChanged({ scheduleType: "seasonal", season: "fall" }, { scheduleType: "seasonal", season: "spring" })).toBe(true)
    expect(cadenceChanged({ scheduleType: "seasonal", season: "fall" }, { scheduleType: "seasonal", season: null })).toBe(false)
  })
  it("no stored schedule at all is a change", () => {
    expect(cadenceChanged({}, { scheduleType: "monthly" })).toBe(true)
  })
})

describe("lastDoneClaim — 'I've been doing this already' counts only when it is the latest", () => {
  it("a real past day later than the current last done is the claim", async () => {
    const { lastDoneClaim } = await import("./cadenceChange")
    expect(lastDoneClaim("2026-10-20", "2026-09-14", TODAY)).toBe("2026-10-20")
    expect(lastDoneClaim("2026-10-20", null, TODAY)).toBe("2026-10-20")
  })
  it("an earlier or equal day, a future day, or no day is not", async () => {
    const { lastDoneClaim } = await import("./cadenceChange")
    expect(lastDoneClaim("2026-09-01", "2026-09-14", TODAY)).toBeNull()
    expect(lastDoneClaim("2026-09-14", "2026-09-14", TODAY)).toBeNull()
    expect(lastDoneClaim("2026-11-01", null, TODAY)).toBeNull()
    expect(lastDoneClaim(null, null, TODAY)).toBeNull()
    expect(lastDoneClaim("last week", null, TODAY)).toBeNull()
  })
})
