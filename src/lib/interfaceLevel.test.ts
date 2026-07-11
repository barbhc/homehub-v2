import { describe, it, expect } from "vitest"
import { coerceInterfaceOverride } from "./interfaceLevel"

describe("coerceInterfaceOverride", () => {
  it("accepts the three valid levels", () => {
    expect(coerceInterfaceOverride("simple")).toBe("simple")
    expect(coerceInterfaceOverride("standard")).toBe("standard")
    expect(coerceInterfaceOverride("advanced")).toBe("advanced")
  })
  it("defaults anything else to standard", () => {
    expect(coerceInterfaceOverride("power")).toBe("standard")
    expect(coerceInterfaceOverride(null)).toBe("standard")
    expect(coerceInterfaceOverride(undefined)).toBe("standard")
    expect(coerceInterfaceOverride(3)).toBe("standard")
    expect(coerceInterfaceOverride({})).toBe("standard")
  })
})
