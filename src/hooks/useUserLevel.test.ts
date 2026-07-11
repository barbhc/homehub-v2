import { describe, it, expect } from "vitest"
import { deriveUserLevel, applyOverride } from "./useUserLevel"

describe("deriveUserLevel", () => {
  it("is essentials for a brand-new / minimal user", () => {
    expect(deriveUserLevel({ itemCount: 0, homeCount: 1, profileCompleted: false })).toBe("essentials")
    expect(deriveUserLevel({ itemCount: 2, homeCount: 1, profileCompleted: true })).toBe("essentials")
  })

  it("stays essentials until the profile is completed", () => {
    expect(deriveUserLevel({ itemCount: 5, homeCount: 1, profileCompleted: false })).toBe("essentials")
  })

  it("is engaged at >=3 items with a completed profile", () => {
    expect(deriveUserLevel({ itemCount: 3, homeCount: 1, profileCompleted: true })).toBe("engaged")
    expect(deriveUserLevel({ itemCount: 14, homeCount: 1, profileCompleted: true })).toBe("engaged")
  })

  it("is power at >=15 items", () => {
    expect(deriveUserLevel({ itemCount: 15, homeCount: 1, profileCompleted: true })).toBe("power")
  })

  it("is power for multi-home regardless of item count", () => {
    expect(deriveUserLevel({ itemCount: 1, homeCount: 2, profileCompleted: false })).toBe("power")
  })
})

describe("applyOverride", () => {
  it("standard keeps the derived level", () => {
    expect(applyOverride("engaged", "standard")).toBe("engaged")
    expect(applyOverride("power", "standard")).toBe("power")
  })
  it("simple forces essentials even for a power user", () => {
    expect(applyOverride("power", "simple")).toBe("essentials")
  })
  it("advanced forces power even for a brand-new user", () => {
    expect(applyOverride("essentials", "advanced")).toBe("power")
  })
})
