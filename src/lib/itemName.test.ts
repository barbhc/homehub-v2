import { describe, it, expect } from "vitest"
import { composeItemName } from "./itemName"

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
