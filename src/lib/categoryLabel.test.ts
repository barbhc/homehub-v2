/**
 * Real values read out of the owner's home (2026-08-18). The item page rendered
 * `category` verbatim, so an air purifier announced itself as "air-purifier"
 * beside a properly-cased room name, and two identical items disagreed about
 * their own capitalisation.
 */
import { describe, it, expect } from "vitest"
import { categoryLabel, prettifyCategory } from "./categoryLabel"

describe("categoryLabel", () => {
  it("names the reported item by its subtype, not its slug", () => {
    expect(categoryLabel({
      category: "air-purifier", item_category: "small_appliance", sub_type: "air-purifier",
    })).toBe("Air purifier")
  })

  it("resolves case drift to one label", () => {
    // Both of these are in the same home right now.
    const a = categoryLabel({ category: "Small Appliance", item_category: "small_appliance", sub_type: null })
    const b = categoryLabel({ category: "Small appliance", item_category: "small_appliance", sub_type: null })
    expect(a).toBe(b)
  })

  it("prefers the subtype over the category when both are known", () => {
    expect(categoryLabel({
      category: "Major Appliance", item_category: "major_appliance", sub_type: "hvac-furnace",
    })).toBe("HVAC / furnace")
  })

  it("falls back to the category when the subtype is unrecognised", () => {
    const label = categoryLabel({
      category: "Small appliance", item_category: "small_appliance", sub_type: "not-a-real-subtype",
    })
    expect(label).toBe("Small Appliance")
    expect(label).not.toBe("not-a-real-subtype")
  })

  it("tidies legacy rows that only have free text", () => {
    expect(categoryLabel({ category: "air-fryer", item_category: null, sub_type: null })).toBe("Air fryer")
    expect(categoryLabel({ category: "water heater", item_category: null, sub_type: null })).toBe("Water heater")
  })

  it("returns null when there is genuinely nothing to say", () => {
    expect(categoryLabel({ category: null, item_category: null, sub_type: null })).toBeNull()
    expect(categoryLabel({ category: "   ", item_category: null, sub_type: null })).toBeNull()
  })
})

describe("prettifyCategory", () => {
  it("turns slugs into sentence case without shouting", () => {
    expect(prettifyCategory("air-purifier")).toBe("Air purifier")
    expect(prettifyCategory("WATER_HEATER")).toBe("Water heater")
  })
})
