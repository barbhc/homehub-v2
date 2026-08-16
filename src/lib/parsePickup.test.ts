import { describe, expect, it } from "vitest"
import { markParsePending, clearParsePending, isParsePending } from "./parsePickup"

describe("parsePickup", () => {
  it("round-trips mark → is → clear", () => {
    expect(isParsePending("m1")).toBe(false)
    markParsePending("m1")
    expect(isParsePending("m1")).toBe(true)
    clearParsePending("m1")
    expect(isParsePending("m1")).toBe(false)
  })

  it("flags are per-manual", () => {
    markParsePending("m2")
    expect(isParsePending("m3")).toBe(false)
    clearParsePending("m2")
  })

  it("clear on an unset flag is a no-op", () => {
    expect(() => clearParsePending("never-set")).not.toThrow()
  })
})
