import { describe, it, expect } from "vitest"
import { composeItemName, isUsableProductName } from "./itemName"

describe("composeItemName — the item type, room only when it has work to do", () => {
  it("uses the item type, not brand and model", () => {
    expect(
      composeItemName({ typeLabel: "Refrigerator", brand: "Fisher & Paykel", model: "RF135BDRUX4" })
    ).toBe("Refrigerator")
  })

  it("does NOT prefix the room — that was the whole complaint", () => {
    const name = composeItemName({ typeLabel: "Refrigerator", room: "Kitchen" })
    expect(name).toBe("Refrigerator")
    expect(name.startsWith("Kitchen")).toBe(false)
  })

  it("appends the room only when the plain type is already taken", () => {
    expect(
      composeItemName({
        typeLabel: "Air filter",
        room: "Garage",
        existingNames: ["Air filter", "Refrigerator"],
      })
    ).toBe("Air filter — Garage")
  })

  it("treats casing and punctuation as the same name when checking collisions", () => {
    expect(
      composeItemName({ typeLabel: "Air filter", room: "Attic", existingNames: ["air-filter"] })
    ).toBe("Air filter — Attic")
  })

  it("falls back to the brand when the type AND the room are both taken", () => {
    expect(
      composeItemName({
        typeLabel: "Air filter",
        room: "Garage",
        brand: "Honeywell",
        existingNames: ["Air filter", "Air filter — Garage"],
      })
    ).toBe("Air filter — Garage (Honeywell)")
  })

  it("stops rather than looping when everything is taken", () => {
    expect(
      composeItemName({
        typeLabel: "Air filter",
        room: "Garage",
        brand: "Honeywell",
        existingNames: ["Air filter", "Air filter — Garage", "Air filter — Garage (Honeywell)"],
      })
    ).toBe("Air filter — Garage")
  })

  it("never renames what the owner typed, even on a collision", () => {
    expect(
      composeItemName({
        typed: "Beer fridge",
        typeLabel: "Refrigerator",
        room: "Garage",
        existingNames: ["Beer fridge"],
      })
    ).toBe("Beer fridge")
  })

  it("trims a typed name rather than treating whitespace as a name", () => {
    expect(composeItemName({ typed: "   ", typeLabel: "Dishwasher" })).toBe("Dishwasher")
  })

  it("falls back to brand + model when the type is not known yet", () => {
    expect(composeItemName({ brand: "LG", model: "DLGX3901B" })).toBe("LG DLGX3901B")
  })

  it("falls back to a brand alone when there is no model", () => {
    expect(composeItemName({ brand: "LG" })).toBe("LG")
  })

  it("never returns an empty name — a save must not fail for want of one", () => {
    expect(composeItemName({})).toBe("Item")
  })

  it("ignores blank entries in the existing-name list", () => {
    expect(
      composeItemName({ typeLabel: "Refrigerator", room: "Kitchen", existingNames: ["", "  "] })
    ).toBe("Refrigerator")
  })
})

describe("isUsableProductName — HH-125", () => {
  it("rejects the phrase that started this: a manual heading carrying the model", () => {
    // The owner's report: "Why is this item named Pan for NSLACO5? This is a
    // rice cooker as a user I should be able to edit this name."
    expect(isUsableProductName("Pan for NSLACO5", "NS-LAC05")).toBe(false)
    expect(isUsableProductName("Pan for NSLACO5", null)).toBe(false) // the " for " tell alone
  })

  it("rejects a name that just repeats the model", () => {
    expect(isUsableProductName("NS-LAC05", "NS-LAC05")).toBe(false)
    expect(isUsableProductName("Zojirushi NS-LAC05", "NS-LAC05")).toBe(false)
  })

  it("keeps the good case — the reason this rule is narrow", () => {
    // Rejecting too much lands everyone back on brand + model, which is exactly
    // what HH-112 was about. These must survive.
    expect(isUsableProductName("Rice Cooker", "NS-LAC05")).toBe(true)
    expect(isUsableProductName("Countertop Microwave", "SMD2470ASY24")).toBe(true)
    expect(isUsableProductName("Dishwasher", null)).toBe(true)
  })

  it("does not throw away a good name over a half-typed model", () => {
    // Regression from the withdraw suite: mid-typing, model was "Core", and
    // "Levoit Core Series Air Purifiers" was being refused for containing it.
    // A word is not a model number.
    expect(isUsableProductName("Levoit Core Series Air Purifiers", "Core")).toBe(true)
    expect(isUsableProductName("Levoit Core Series Air Purifiers", "Core 300")).toBe(true)
    // …but a real model number still disqualifies.
    expect(isUsableProductName("Levoit Core300 Air Purifier", "Core300")).toBe(false)
  })

  it("rejects empties and essays", () => {
    expect(isUsableProductName("", "X")).toBe(false)
    expect(isUsableProductName(null, "X")).toBe(false)
    expect(isUsableProductName("A".repeat(60), null)).toBe(false)
  })
})
