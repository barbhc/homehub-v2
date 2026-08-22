import { describe, it, expect } from "vitest"
import { fmtMoney } from "./itemMoney"

describe("fmtMoney", () => {
  it("keeps both cents digits", () => {
    expect(fmtMoney(1099.5)).toBe("$1,099.50")
    expect(fmtMoney(19.99)).toBe("$19.99")
  })
  it("drops the decimals on a whole number", () => {
    expect(fmtMoney(1099)).toBe("$1,099")
    expect(fmtMoney(0)).toBe("$0")
  })
})
