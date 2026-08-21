/**
 * HH-82 — "I'm still not seeing these tasks on my task list" (Chris, twice).
 *
 * The item page said "On a schedule · 3" and the Tasks list showed none of
 * them. Neither screen was broken; they disagreed about what "scheduled" means,
 * and the disagreement was invisible. These pin the rule the item page now
 * shows, so the two definitions cannot silently drift apart again.
 */
import { describe, expect, it } from "vitest"
import { isAgendaEligible } from "../../../shared/tasks/agendaEligibility"

const row = (careType: string, scopeType: string) => ({ careType, scopeType })

describe("what the Tasks list will and will not show", () => {
  it("hides cleaning for a single item — the rule behind Chris's empty list", () => {
    expect(isAgendaEligible(row("cleaning", "item_unit"))).toBe(false)
  })

  it("shows maintenance for a single item", () => {
    expect(isAgendaEligible(row("maintenance", "item_unit"))).toBe(true)
  })

  it("shows cleaning scoped to the HOME — a real household chore", () => {
    expect(isAgendaEligible(row("cleaning", "home"))).toBe(true)
  })

  it("is permissive when the labels are missing", () => {
    // A task with no careType must not vanish; the exclusion is narrow on
    // purpose, and an unlabelled row is not evidence of anything.
    expect(isAgendaEligible({})).toBe(true)
    expect(isAgendaEligible({ careType: null, scopeType: null })).toBe(true)
    expect(isAgendaEligible({ careType: "cleaning", scopeType: null })).toBe(true)
  })
})
