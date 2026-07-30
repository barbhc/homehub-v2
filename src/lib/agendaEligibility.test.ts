/**
 * Agenda eligibility — pins the rule that item-scoped cleaning stays off Home.
 * getUpcomingTasks lacked this filter (weekAgenda had it inline), which is how
 * "Clean Interior Surfaces" reached Due Today in the 2026-07-29 report.
 */
import { describe, it, expect } from "vitest"
import { isAgendaEligible } from "./agendaEligibility"

describe("isAgendaEligible", () => {
  it("excludes item-scoped cleaning (lives on the Cleaning page + item page)", () => {
    expect(isAgendaEligible({ careType: "cleaning", scopeType: "item_unit" })).toBe(false)
  })

  it("keeps home-scoped cleaning — a genuine household chore", () => {
    expect(isAgendaEligible({ careType: "cleaning", scopeType: "home" })).toBe(true)
  })

  it("keeps maintenance and mixed at either scope", () => {
    expect(isAgendaEligible({ careType: "maintenance", scopeType: "item_unit" })).toBe(true)
    expect(isAgendaEligible({ careType: "mixed", scopeType: "item_unit" })).toBe(true)
    expect(isAgendaEligible({ careType: "maintenance", scopeType: "home" })).toBe(true)
  })

  it("keeps rows with missing denorm fields (fail-open, never hides upkeep)", () => {
    expect(isAgendaEligible({})).toBe(true)
    expect(isAgendaEligible({ careType: null, scopeType: null })).toBe(true)
    expect(isAgendaEligible({ careType: "cleaning" })).toBe(true) // unknown scope
  })
})
