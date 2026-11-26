import { describe, expect, it } from "vitest"
import { itemMatchesQuery, kindsInQuery } from "./itemSearch"

const item = (display_name: string, over: Partial<{ brand: string; model: string; category: string }> = {}) => ({
  display_name, brand: over.brand ?? null, model: over.model ?? null, category: over.category ?? null,
})

// The seeded fridge (scripts/seed-emulator.ts) — the report's exact case.
const FRIDGE = item("LG French Door Refrigerator", { brand: "LG", model: "LRFVS3006S", category: "refrigerator" })

describe("Items search", () => {
  it("“fridge” finds the LG French Door Refrigerator", () => {
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "fridge")).toBe(true)
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "Fridge ")).toBe(true)
  })
  it("still matches name and brand, and now the model and the room", () => {
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "french")).toBe(true)
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "lg")).toBe(true)
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "lrfvs")).toBe(true)
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "kitch")).toBe(true)
    expect(itemMatchesQuery(FRIDGE, null, "kitch")).toBe(false)
  })
  it.each([
    ["refrigerator", item("Sub-Zero 648PRO", { category: "fridge" })],
    ["washer", item("LG WM4000HWA Washing Machine")],
    ["washing machine", item("Samsung front-load washer")],
    ["dryer", item("Whirlpool Heat-Pump Dryer")],
    ["ac", item("Mitsubishi mini-split")],
    ["air conditioner", item("Carrier central AC", { category: "air-conditioner" })],
    ["dishwasher", item("Bosch 800 Series", { category: "dishwasher" })],
    ["water heater", item("Rheem 50 gal", { category: "water-heater" })],
    ["furnace", item("Lennox SL280", { category: "hvac-furnace" })],
    ["heater", item("Lennox SL280", { category: "hvac-furnace" })],
  ])("“%s” finds %o by its kind", (q, it_) => {
    expect(itemMatchesQuery(it_, null, q)).toBe(true)
  })
  it("a kind word does not drag in other kinds", () => {
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "washer")).toBe(false)
    expect(itemMatchesQuery(item("Whirlpool Heat-Pump Dryer"), null, "ac")).toBe(false)
    expect(itemMatchesQuery(FRIDGE, "Kitchen", "zzz")).toBe(false)
  })
  it("an empty query matches everything", () => {
    expect(itemMatchesQuery(FRIDGE, null, "  ")).toBe(true)
    expect(kindsInQuery("")).toEqual([])
  })
})

describe("search-only words stay out of each other's way", () => {
  it("“heater” finds a furnace by kind and a water heater by its category, and a water heater is never a furnace", () => {
    expect(itemMatchesQuery(item("Rheem 50 gal", { category: "water-heater" }), null, "heater")).toBe(true)
    expect(itemMatchesQuery(item("Rheem 50 gal", { category: "water-heater" }), null, "furnace")).toBe(false)
  })
})
