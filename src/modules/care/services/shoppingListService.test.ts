import { describe, it, expect } from "vitest"
import { toggleShoppingStatus } from "./shoppingStatus"

describe("toggleShoppingStatus", () => {
  it("checks a needed item off as bought", () => {
    expect(toggleShoppingStatus("needed")).toBe("bought")
  })
  it("un-checks a bought item back to needed", () => {
    expect(toggleShoppingStatus("bought")).toBe("needed")
  })
  it("flips an 'already have' item to bought when checked", () => {
    expect(toggleShoppingStatus("have")).toBe("bought")
  })
})
