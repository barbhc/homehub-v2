import { describe, expect, it } from "vitest"
import { monthlyRefreshDue } from "./monthlyRefresh"

describe("monthlyRefreshDue", () => {
  it("is due in a later month, until that month is answered", () => {
    expect(monthlyRefreshDue({ today: "2026-12-01", createdAt: "2026-11-19T18:00:00.000Z", answeredMonth: null })).toBe(true)
    expect(monthlyRefreshDue({ today: "2026-12-14", createdAt: "2026-11-19T18:00:00.000Z", answeredMonth: "2026-12" })).toBe(false)
    expect(monthlyRefreshDue({ today: "2027-01-02", createdAt: "2026-11-19T18:00:00.000Z", answeredMonth: "2026-12" })).toBe(true)
  })
  it("is not due in the month the home was created: onboarding just showed that list", () => {
    expect(monthlyRefreshDue({ today: "2026-11-25", createdAt: "2026-11-19T18:00:00.000Z", answeredMonth: null })).toBe(false)
  })
  it("treats a home with no creation date as an older one", () => {
    expect(monthlyRefreshDue({ today: "2026-11-25", createdAt: "", answeredMonth: null })).toBe(true)
  })
})
