/**
 * Cadence labels. The corpus is the owner's real dryer manual, where "Replace
 * Inlet Hoses (Steam Models)" — whose own text says "replace after 5 years" —
 * rendered as "Repeats every_n_days".
 */
import { describe, it, expect } from "vitest"
import { cadenceLabel, everyNDaysLabel } from "../../shared/tasks/cadenceLabel"

describe("cadenceLabel", () => {
  it("never leaks a raw enum to the user", () => {
    for (const t of ["weekly", "monthly", "quarterly", "semiannual", "annual", "seasonal", "setup", "as_needed", "after_each_use", "every_n_days"]) {
      expect(cadenceLabel(t, 30), t).not.toMatch(/_/)
    }
    // …including a value nobody has defined yet.
    expect(cadenceLabel("biennial_ish")).toBe("Biennial ish")
  })

  it("the real case: 5 years reads as years, not 1825 days", () => {
    expect(cadenceLabel("every_n_days", 1825)).toBe("Every 5 years")
  })

  it("picks the largest whole unit", () => {
    expect(everyNDaysLabel(365)).toBe("Every year")
    expect(everyNDaysLabel(730)).toBe("Every 2 years")
    expect(everyNDaysLabel(90)).toBe("Every 3 months")
    expect(everyNDaysLabel(30)).toBe("Every month")
    expect(everyNDaysLabel(14)).toBe("Every 2 weeks")
    expect(everyNDaysLabel(7)).toBe("Every week")
    expect(everyNDaysLabel(45)).toBe("Every 45 days")
  })

  it("degrades safely when the interval is missing", () => {
    expect(cadenceLabel("every_n_days", null)).toBe("Every so often")
    expect(cadenceLabel("every_n_days", 0)).toBe("Every so often")
    expect(cadenceLabel(null)).toBe("When needed")
  })
})
