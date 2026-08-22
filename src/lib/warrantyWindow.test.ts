import { describe, it, expect } from "vitest"
import { warrantyExpiry } from "./warrantyWindow"

describe("warrantyExpiry", () => {
  it("counts calendar months, so the date matches the receipt", () => {
    expect(warrantyExpiry("2026-02-14", 24)).toBe("2028-02-14")
    expect(warrantyExpiry("2026-01-31", 1)).toBe("2026-03-03") // JS month-end roll, unchanged from the wizard
  })

  it("returns null rather than a wrong date when either half is missing", () => {
    expect(warrantyExpiry("", 12)).toBeNull()
    expect(warrantyExpiry("2026-02-14", null)).toBeNull()
    expect(warrantyExpiry("2026-02-14", 0)).toBeNull()
    expect(warrantyExpiry("not-a-date", 12)).toBeNull()
  })
})
