import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { kindOf, archetypeOf, suggestionsForItem, suggestionsForHome, entriesForKind, LIBRARY, typicalFilterCadence as typical } from "./library"

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

describe("kindOf — a sub-type id in the category reads as its words (before-friends PR C)", () => {
  // "What is it?" (the add screen's chips, and the item page's no-manual card)
  // stores the chip's sub-type id as the category. The item's own name says
  // nothing, so the category alone has to carry the kind.
  const picked = (category: string) => ({ display_name: "Bosch SHPM88Z75N", category, brand: "Bosch", model: "SHPM88Z75N" })

  it("every KIND_CHIPS sub-type maps to its kind", async () => {
    const { KIND_CHIPS } = await import("../../src/components/smart-add/identifyData")
    const expected: Record<string, string> = {
      "washing-machine": "washer", dryer: "dryer", dishwasher: "dishwasher", refrigerator: "refrigerator",
      "water-heater": "water_heater", "hvac-furnace": "furnace", "oven-range": "oven_range",
    }
    expect(KIND_CHIPS.map((k) => k.subType).sort()).toEqual(Object.keys(expected).sort())
    for (const k of KIND_CHIPS) expect(kindOf(picked(k.subType)), k.subType).toBe(expected[k.subType])
  })

  // Every seeded item (scripts/seed-emulator.ts) plus hyphenated names and
  // models, each with the kind it had BEFORE the change. Only the category's
  // hyphens are read as spaces: across the whole text, "Heat-Pump Dryer"
  // would match the heat-pump rule and turn into HVAC.
  const unchanged: [string, { display_name: string; category: string | null; brand: string | null; model: string | null }, string | null][] = [
    ["seed: dishwasher", { display_name: "Bosch 800 Series Dishwasher", category: "dishwasher", brand: "Bosch", model: "SHPM88Z75N" }, "dishwasher"],
    ["seed: fridge", { display_name: "LG French Door Refrigerator", category: "refrigerator", brand: "LG", model: "LRFVS3006S" }, "refrigerator"],
    ["seed: furnace", { display_name: "Carrier Infinity Furnace", category: "furnace", brand: "Carrier", model: "59MN7" }, "furnace"],
    ["seed: washer", { display_name: "Whirlpool Front-Load Washer", category: "washer", brand: "Whirlpool", model: "WFW9620HC" }, "washer"],
    ["seed: water heater", { display_name: "Rheem Performance Water Heater", category: "water_heater", brand: "Rheem", model: "XE50T10" }, "water_heater"],
    ["seed: range", { display_name: "GE Profile Gas Range", category: "range", brand: "GE", model: "PGB960" }, "oven_range"],
    ["seed: microwave", { display_name: "Sharp Microwave Drawer", category: "microwave", brand: "Sharp", model: "SMD2470ASY24" }, "microwave"],
    ["hyphenated name: heat-pump dryer", { display_name: "Heat-Pump Dryer", category: null, brand: "Miele", model: "TWB120WP" }, "dryer"],
    ["hyphenated name + dryer category", { display_name: "Miele T1 Heat-Pump Dryer", category: "dryer", brand: "Miele", model: "TWI180WP" }, "dryer"],
    ["hyphenated name: heat-pump water heater", { display_name: "Heat-Pump Water Heater", category: null, brand: "Rheem", model: "PROPH50" }, "water_heater"],
    ["hyphenated model, no kind", { display_name: "LG WM-4000HWA", category: null, brand: "LG", model: "WM-4000HWA" }, null],
    ["hyphenated name: Wi-Fi range", { display_name: "Wi-Fi Range", category: null, brand: "GE", model: "JB-735" }, "oven_range"],
    ["hyphenated name: ceiling-fan", { display_name: "Ceiling-fan", category: null, brand: "Hunter", model: null }, "ceiling_fan"],
    ["hyphenated name: carbon-monoxide alarm", { display_name: "Carbon-monoxide alarm", category: null, brand: "Kidde", model: "KN-COB-B" }, null],
    ["mini-split, air-conditioner category", { display_name: "Mini-split", category: "air-conditioner", brand: "Mitsubishi", model: "MSZ-GL12NA" }, "hvac"],
    ["range-hood category", { display_name: "Range-hood", category: "range-hood", brand: "Zephyr", model: null }, "range_hood"],
    ["air-fryer category", { display_name: "Air-fryer", category: "air-fryer", brand: "Ninja", model: "AF-101" }, null],
    ["garbage-disposal category", { display_name: "Garbage disposal", category: "garbage-disposal", brand: "InSinkErator", model: "Evolution" }, null],
    ["wine-fridge category", { display_name: "Wine fridge", category: "wine-fridge", brand: null, model: null }, "refrigerator"],
    ["tankless-water-heater category", { display_name: "Tankless", category: "tankless-water-heater", brand: "Rinnai", model: "RU199iN" }, "water_heater"],
    ["air-purifier category", { display_name: "Levoit Core Air Purifiers", category: "air-purifier", brand: "Levoit", model: "Core 300" }, "air_purifier"],
  ]
  it.each(unchanged)("%s keeps its kind", (_label, item, kind) => {
    expect(kindOf(item)).toBe(kind)
  })

  it("the table covers every item the emulator seed creates", async () => {
    const seed = readFileSync(resolve(__dirname, "../../scripts/seed-emulator.ts"), "utf8")
    const seeded = [...seed.matchAll(/displayName: "([^"]+)"/g)].map((m) => m[1])
    expect(seeded.length).toBeGreaterThan(0)
    const covered = unchanged.filter(([label]) => label.startsWith("seed:")).map(([, it]) => it.display_name)
    expect(covered.sort()).toEqual(seeded.sort())
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
  it("home entries are all gated, by a fact or the home's area; item entries never are", () => {
    // Two seasonal entries (2026-11-19) apply to every home and are
    // reached only through the monthly refresh's timing, never the fact-gated
    // Suggested group (suggestionsForHome requires a true fact).
    const everyHome = new Set(["home.radon_test", "home.leak_check"])
    for (const e of LIBRARY) expect(!!(e.fact || e.area) || everyHome.has(e.key)).toBe(e.kind === "home")
    for (const e of LIBRARY) if (e.kind !== "home") expect(e.fact ?? e.area).toBeUndefined()
    expect(entriesForKind("air_purifier").length).toBe(3)
  })
  it("every entry's own title is its own archetype — so adding it is never offered again", () => {
    for (const e of LIBRARY) expect([e.key, archetypeOf(e.title)]).toEqual([e.key, e.archetype])
  })
})

describe("D8 starter entries", () => {
  it("an area-gated entry is never offered without the area — quake straps never reach Ohio", () => {
    const facts = { has_water_heater: true, has_outdoor_taps: true }
    const keys = (area: Parameters<typeof suggestionsForHome>[3]) => suggestionsForHome(facts, [], [], area).map((s) => s.entry.key)
    expect(keys(undefined)).not.toContain("home.quake_straps")
    expect(keys(undefined)).not.toContain("home.outdoor_taps")
    expect(keys(["earthquake"])).toContain("home.quake_straps")
    expect(keys(["freeze"])).toContain("home.outdoor_taps")
  })
  it("the wildfire task is not the gutters task, in either direction", () => {
    expect(archetypeOf("Clear leaves from the roof, gutters and vents")).toBe("wildfire.clear")
    expect(archetypeOf("Clean the gutters")).toBe("gutters.clean")
  })
  it("recognises the new work in a manual's words", () => {
    expect(archetypeOf("Inspect seismic straps on the water heater")).toBe("quake.strap")
    expect(archetypeOf("Drain outdoor faucets before winter")).toBe("freeze.taps")
    expect(archetypeOf("Winterize hose bibs")).toBe("freeze.taps")
    expect(archetypeOf("Hurricane shutter check")).toBe("hurricane.prep")
  })
})

// ── D4: the filters people forget ────────────────────────────────────────────

describe("typicalFilterCadence (D4)", () => {
  const washer = { display_name: "LG Front Load Washer", category: "washer" }

  it("offers the library's cadence for a washer filter the manual left when-needed", () => {
    const drain = typical(washer, { title: "Clean the Drain Pump Filter", scheduleType: "as_needed" })
    expect(drain?.entry.key).toBe("washer.drain_filter")
    expect(drain?.entry.scheduleType).toBe("monthly")
    expect(drain?.kindLabel).toBe("washers")
    expect(typical(washer, { title: "Clean the Water Inlet Filters", scheduleType: "as_needed" })?.entry.scheduleType).toBe("semiannual")
  })

  it("the manual's own cadence always wins", () => {
    expect(typical(washer, { title: "Clean the Drain Pump Filter", scheduleType: "monthly" })).toBeNull()
  })

  it("never the lint screen — it is cleaned as you go", () => {
    expect(typical({ display_name: "LG Dryer", category: "dryer" }, { title: "Clean the Lint Filter", scheduleType: "as_needed" })).toBeNull()
  })

  it("only filters, only for a kind the library knows", () => {
    expect(typical(washer, { title: "Run the Tub Clean Cycle", scheduleType: "as_needed" })).toBeNull()
    expect(typical({ display_name: "Vitamix Blender" }, { title: "Clean the Drain Pump Filter", scheduleType: "as_needed" })).toBeNull()
    expect(typical({ display_name: "Bosch Dishwasher" }, { title: "Clean the Filter System", scheduleType: "setup" })).toBeNull()
  })

  it("covers the other forgettable filters the library already had", () => {
    expect(typical({ display_name: "Bosch Dishwasher" }, { title: "Clean the drain filter", scheduleType: "as_needed" })?.entry.key).toBe("dishwasher.filter")
    expect(typical({ display_name: "Zephyr Range Hood" }, { title: "Clean the mesh grease filters", scheduleType: "as_needed" })?.entry.key).toBe("range_hood.mesh")
  })

  it("a washer with no filter task is never told it has one (top-loaders may not)", () => {
    const keys = suggestionsForItem(washer, []).map((s) => s.entry.key)
    expect(keys).not.toContain("washer.drain_filter")
    expect(keys).not.toContain("washer.inlet_filter")
    // …but the manual's own when-needed task gets the backstop offer on the item page.
    const withTask = suggestionsForItem(washer, [{ title: "Clean the Drain Pump Filter", scheduleType: "as_needed" }])
    expect(withTask.find((s) => s.entry.key === "washer.drain_filter")?.backstopFor?.title).toBe("Clean the Drain Pump Filter")
  })
})

/**
 * Before-friends B1: smoke and carbon monoxide (CO) are two answers. The CO
 * alarm's replace-by date is its own archetype, ruled BEFORE the alarm test
 * and the battery change so neither swallows it.
 */
describe("the carbon monoxide (CO) alarm's date — its own archetype", () => {
  it.each([
    ["Check the carbon monoxide (CO) alarm's date", "alarm.co.check"],
    ["Check the CO detector's expiry date", "alarm.co.check"],
    ["Test the smoke alarms", "safety.test.alarm"],
    ["Test smoke and CO alarms", "safety.test.alarm"],
    ["Test the CO alarm", "safety.test.alarm"],
    ["Replace CO alarm batteries", "battery.replace.alarm"],
    ["Replace alarm batteries", "battery.replace.alarm"],
  ])("%s → %s", (title, archetype) => {
    expect(archetypeOf(title)).toBe(archetype)
  })

  it("near misses are not the CO check: a date with no CO alarm, or a CO alarm with no date", () => {
    for (const t of ["Check the condenser coil date", "Check smoke alarm expiry date", "Clean the coils on this date", "Test the CO alarm"]) {
      expect(archetypeOf(t), t).not.toBe("alarm.co.check")
    }
    // What they are instead, unchanged from before the new entry joined the library.
    expect(archetypeOf("Check the condenser coil date")).toBe("coils.clean")
    expect(archetypeOf("Clean the coils on this date")).toBe("coils.clean")
  })

  it("the new title joins the similarity pool without moving anything that was already there", () => {
    // Their similarity to the new title is 0.33, 0.40 and 0.20; the threshold is 0.5.
    expect(archetypeOf("Check the fire extinguisher")).toBe("extinguisher.check")
    expect(archetypeOf("Check the alarm")).toBeNull()
    expect(archetypeOf("Check the water heater's quake straps")).toBe("quake.strap")
  })

  it("the library's smoke entry is the smoke test alone; the CO entry is yearly, essential and sourced", () => {
    const byKey = (k: string) => LIBRARY.find((e) => e.key === k)!
    expect(byKey("home.alarm_test").title).toBe("Test the smoke alarms")
    expect(byKey("home.alarm_test").fact).toBe("has_smoke_alarms")
    const co = byKey("home.co_alarm_check")
    expect(co).toMatchObject({
      kind: "home", archetype: "alarm.co.check", title: "Check the carbon monoxide (CO) alarm's date",
      careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "annual",
      minutes: 2, cadenceLabel: "Yearly", fact: "has_co_alarms",
      source: "Alarm makers' end-of-life guidance (Kidde, First Alert)",
    })
    // D4: makers differ (Kidde 7 to 10, others 5 to 7); the date on the unit is what counts.
    expect(co.why).toBe("Their sensors wear out. Most last 5 to 10 years, and the replace-by date is on the back.")
  })

  it("suggestionsForHome offers the CO check only when has_co_alarms is true", () => {
    const keys = (facts: Parameters<typeof suggestionsForHome>[0]) => suggestionsForHome(facts, []).map((s) => s.entry.key)
    expect(keys({ has_smoke_alarms: true })).not.toContain("home.co_alarm_check")
    expect(keys({ has_smoke_alarms: true, has_co_alarms: false })).not.toContain("home.co_alarm_check")
    expect(keys({ has_co_alarms: true })).toEqual(["home.co_alarm_check"])
  })

  it("a home with a stored 'Test smoke and CO alarms' task is still offered the CO check, and never a second alarm test", () => {
    const s = suggestionsForHome({ has_smoke_alarms: true, has_co_alarms: true }, [{ title: "Test smoke and CO alarms", scheduleType: "semiannual" }])
    const keys = s.map((x) => x.entry.key)
    expect(keys).toContain("home.co_alarm_check")
    expect(keys).not.toContain("home.alarm_test")
  })
})
