import { describe, it, expect } from "vitest"
import { applyScannedIdentity, scannedFieldsChanged } from "./scanPrecedence"

const typed = (brand: string, model: string) => ({ brand, model })

describe("a label photo beats what was typed (HH-139)", () => {
  it("replaces a wrong brand — her exact case", () => {
    // She picked GE Café, then photographed a Bosch dishwasher's nameplate.
    const next = applyScannedIdentity(typed("GE Café", ""), { brand: "Bosch", model: "SHPM65Z55N/01" })
    expect(next).toEqual({ brand: "Bosch", model: "SHPM65Z55N/01" })
  })

  it("never leaves one field from the photo and one from memory", () => {
    // The chimera: a Bosch model under a GE Café brand is a product that does
    // not exist, and it is worse than either field alone because nothing on
    // screen says the pair is wrong.
    const next = applyScannedIdentity(typed("GE Café", "OLD-123"), { model: "SHPM65Z55N/01" })
    expect(next.brand).not.toBe("GE Café")
    expect(next).toEqual({ brand: "", model: "SHPM65Z55N/01" })
  })

  it("fills blanks too — the ordinary case still works", () => {
    expect(applyScannedIdentity(typed("", ""), { brand: "LG", model: "WM4000HWA" }))
      .toEqual({ brand: "LG", model: "WM4000HWA" })
  })

  it("changes NOTHING when the scan identified no product", () => {
    // A receipt with no nameplate on it, or an unreadable photo. Wiping what
    // someone typed because a photo failed would be the worse bug.
    const before = typed("Bosch", "SHPM65Z55N/01")
    expect(applyScannedIdentity(before, { brand: null, model: null })).toEqual(before)
    expect(applyScannedIdentity(before, {})).toEqual(before)
    expect(applyScannedIdentity(before, { brand: "   ", model: "" })).toEqual(before)
  })

  it("trims, so whitespace is not treated as a reading", () => {
    expect(applyScannedIdentity(typed("GE", "X"), { brand: "  Bosch  ", model: " SHPM65Z55N/01 " }))
      .toEqual({ brand: "Bosch", model: "SHPM65Z55N/01" })
  })
})

describe("what the card says it did", () => {
  it("counts a REPLACEMENT, not just a fill", () => {
    // "Filled 0 fields" right after overwriting two of them is the screen
    // arguing with itself.
    const before = typed("GE Café", "OLD-123")
    const after = applyScannedIdentity(before, { brand: "Bosch", model: "SHPM65Z55N/01" })
    expect(scannedFieldsChanged(before, after)).toBe(2)
  })

  it("counts nothing when nothing moved", () => {
    const before = typed("Bosch", "SHPM65Z55N/01")
    expect(scannedFieldsChanged(before, applyScannedIdentity(before, { brand: "Bosch", model: "SHPM65Z55N/01" }))).toBe(0)
  })

  it("does not count a field the scan blanked", () => {
    // Blanking is real and deliberate, but "filled 1 field" is the honest count
    // when only the model came off the plate.
    const before = typed("GE Café", "OLD-123")
    const after = applyScannedIdentity(before, { model: "SHPM65Z55N/01" })
    expect(scannedFieldsChanged(before, after)).toBe(1)
  })
})
