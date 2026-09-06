import { describe, it, expect } from "vitest"
import { kindOf, archetypeOf, suggestionsForItem, suggestionsForHome, entriesForKind, LIBRARY } from "./library"

/**
 * The care library, pinned against the owner's REAL home (2026-09-06):
 * 17 items, 41 recurring tasks across 11 of them, and three gaps she named —
 * the Levoit with no manual, the Nespresso whose descale could never remind,
 * and the pest control no manual will ever produce.
 */
const her = {
  levoit: { display_name: "Levoit Core Air Purifiers", category: "air-purifier", brand: "Levoit", model: "Core 300" },
  coway: { display_name: "Coway Air Purifier", category: "air-purifier", brand: "Coway", model: null },
  nespresso: { display_name: "Nespresso Coffee", category: "Small appliance", brand: "Nespresso", model: "Vertuo Plus" },
  dryer: { display_name: "Dryer", category: "Dryer", brand: "LG", model: "DLGX3901B" },
  hood: { display_name: "Range Hood", category: "Fixture", brand: "Zephyr", model: null },
  fridge: { display_name: "Refrigerator", category: "Major appliance", brand: "Fisher & Paykel", model: null },
  blender: { display_name: "KitchenAid Mini Blender", category: "Small Appliance", brand: "KitchenAid", model: null },
  creami: { display_name: "Ninja Creami Deluxe", category: "Small appliance", brand: "SharkNinja", model: null },
  fans: { display_name: "Haiku Ceiling Fans", category: "Fixture", brand: "Big Ass Fans", model: null },
  foodcycler: { display_name: "FoodCycler", category: "Small appliance", brand: "Vitamix", model: null },
}

describe("kindOf — what an item is, from the fields it already carries", () => {
  it("resolves every kind the library serves in her home", () => {
    expect(kindOf(her.levoit)).toBe("air_purifier")
    expect(kindOf(her.coway)).toBe("air_purifier")
    expect(kindOf(her.nespresso)).toBe("coffee_machine")
    expect(kindOf(her.dryer)).toBe("dryer")
    expect(kindOf(her.hood)).toBe("range_hood")
    expect(kindOf(her.fridge)).toBe("refrigerator")
    expect(kindOf(her.foodcycler)).toBe("food_recycler")
    expect(kindOf({ display_name: "Dishwasher", category: "Major Appliance", brand: "Bosch" })).toBe("dishwasher")
    expect(kindOf({ display_name: "Furnace", category: "System", brand: "York" })).toBe("furnace")
    expect(kindOf({ display_name: "Washer", category: "Major appliance", brand: "LG" })).toBe("washer")
  })
  it("a blender or an ice-cream maker is nobody's kind — nothing to remind (owner's Q6)", () => {
    expect(kindOf(her.blender)).toBeNull()
    expect(kindOf(her.creami)).toBeNull()
    expect(kindOf({ display_name: "Air fryer", category: "air-fryer", brand: "Ninja" })).toBeNull()
  })
  it("specific beats generic — a range HOOD is not an oven range", () => {
    expect(kindOf({ display_name: "Range Hood", category: "Fixture" })).toBe("range_hood")
    expect(kindOf({ display_name: "Range", category: "Major appliance", brand: "GE" })).toBe("oven_range")
  })
})

describe("archetypeOf — parsed titles map to canonical care", () => {
  it("recognises her real parsed titles", () => {
    expect(archetypeOf("Replace the HEPA Filter")).toBe("filter.replace.hepa")
    expect(archetypeOf("Replace the Deodorization Filter")).toBe("filter.replace.carbon")
    expect(archetypeOf("Clean the Pre-Filter")).toBe("filter.clean.pre")
    expect(archetypeOf("Clean Aluminum Mesh Filters")).toBe("filter.clean.mesh")
    expect(archetypeOf("Inspect and Clean Ductwork")).toBe("duct.clean")
    expect(archetypeOf("Check Ductwork for Lint Monthly")).toBe("duct.clean")
    expect(archetypeOf("Run Tub Clean Cycle")).toBe("tub.clean")
    expect(archetypeOf("Replace Water Filter Cartridge")).toBe("filter.replace.water")
    expect(archetypeOf("Replace carbon filters")).toBe("filter.replace.carbon")
    expect(archetypeOf("Descale the Machine")).toBe("descale")
    expect(archetypeOf("Test Carbon Monoxide Detectors")).toBe("safety.test.alarm")
    expect(archetypeOf("Replace the Air Filter")).toBe("filter.replace.air")
    expect(archetypeOf("Clean the Lint Filter")).toBe("filter.clean.lint")
  })
  it("a tip is nobody's archetype", () => {
    expect(archetypeOf("Allow Motor to Cool After Overload")).toBeNull()
    expect(archetypeOf("Verify Clearance Around Unit")).toBeNull()
  })
})

describe("suggestionsForItem — the manual wins, gaps get offered", () => {
  it("the Levoit with no manual gets the purifier's typical care, filters first", () => {
    const s = suggestionsForItem(her.levoit, [])
    expect(s.map((x) => x.entry.key)).toEqual(["air_purifier.hepa", "air_purifier.prefilter", "air_purifier.sensor"])
    expect(s.every((x) => !x.backstopFor)).toBe(true)
  })
  it("the Coway, whose manual already has both filters, is offered only what it lacks", () => {
    const existing = ["Replace the HEPA Filter", "Replace the Deodorization Filter", "Clean the Pre-Filter", "Clean the Air Inlet and Outlet Vents"].map((title) => ({ title, scheduleType: "semiannual" }))
    const s = suggestionsForItem(her.coway, existing)
    expect(s.map((x) => x.entry.key)).toEqual(["air_purifier.sensor"])
  })
  it("the Nespresso's as_needed descale comes back as a BACKSTOP offer, not a new task", () => {
    const s = suggestionsForItem(her.nespresso, [{ title: "Descale the Machine", scheduleType: "as_needed" }])
    expect(s).toHaveLength(1)
    expect(s[0].entry.key).toBe("coffee_machine.descale")
    expect(s[0].backstopFor?.title).toBe("Descale the Machine")
  })
  it("…and once it has a cadence, nothing is offered", () => {
    expect(suggestionsForItem(her.nespresso, [{ title: "Descale the Machine", scheduleType: "quarterly" }])).toEqual([])
  })
  it("a dismissed suggestion stays dismissed", () => {
    const s = suggestionsForItem(her.levoit, [], ["air_purifier.sensor"])
    expect(s.map((x) => x.entry.key)).toEqual(["air_purifier.hepa", "air_purifier.prefilter"])
  })
  it("a blender gets nothing, and says so by being empty", () => {
    expect(suggestionsForItem(her.blender, [])).toEqual([])
  })
})

describe("suggestionsForHome — facts gate the building-level entries", () => {
  it("nothing without facts; the right entries with them", () => {
    expect(suggestionsForHome({}, [])).toEqual([])
    const s = suggestionsForHome({ has_smoke_alarms: true, termite_risk: true, birds_roosting: true }, [])
    expect(s.map((x) => x.entry.key)).toEqual(["home.alarm_test", "home.alarm_batteries", "home.termite", "home.birds"])
  })
  it("'the building handles pests' removes the pest entries, not the safety ones", () => {
    const s = suggestionsForHome({ has_smoke_alarms: true, termite_risk: true, birds_roosting: true, building_handles_pests: true }, [])
    expect(s.map((x) => x.entry.key)).toEqual(["home.alarm_test", "home.alarm_batteries"])
  })
  it("an existing home task covering the archetype is never re-suggested", () => {
    const s = suggestionsForHome({ has_smoke_alarms: true }, [{ title: "Test smoke & CO detectors", scheduleType: "semiannual" }])
    expect(s.map((x) => x.entry.key)).toEqual(["home.alarm_batteries"])
  })
})

describe("the library's own hygiene", () => {
  it("every entry has a source, a why, a how, and a unique key", () => {
    const keys = new Set<string>()
    for (const e of LIBRARY) {
      expect(e.source.length).toBeGreaterThan(8)
      expect(e.why.length).toBeGreaterThan(10)
      expect(e.how.length).toBeGreaterThan(10)
      expect(keys.has(e.key)).toBe(false)
      keys.add(e.key)
    }
  })
  it("home entries are all fact-gated; item entries never are", () => {
    for (const e of LIBRARY) expect(!!e.fact).toBe(e.kind === "home")
    expect(entriesForKind("air_purifier").length).toBe(3)
  })
})
