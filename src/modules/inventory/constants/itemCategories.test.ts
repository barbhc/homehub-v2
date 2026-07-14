import { describe, it, expect } from "vitest"
import { mapOcrCategoryToTyped, suggestedRoomForSubType } from "./itemCategories"

describe("mapOcrCategoryToTyped — name-first quick-add inference", () => {
  it.each([
    ["LG washer", "major_appliance", "washing-machine"],
    ["Whirlpool washer", "major_appliance", "washing-machine"],
    ["Samsung dryer", "major_appliance", "dryer"],
    ["GE fridge", "major_appliance", "refrigerator"],
    ["Bosch dishwasher", "major_appliance", "dishwasher"],
    ["Bathroom faucet", "fixture", "faucet"],
    ["Sony TV", "media", "television"],
    ["Nespresso coffee", "small_appliance", "coffee-maker"],
  ])("%s → %s / %s", (name, cat, sub) => {
    expect(mapOcrCategoryToTyped(name)).toEqual({ itemCategory: cat, subType: sub })
  })

  it("keeps power/pressure washer as outdoor (the washer includes-guard)", () => {
    expect(mapOcrCategoryToTyped("power washer")).toEqual({ itemCategory: "outdoor", subType: "power-washer" })
    expect(mapOcrCategoryToTyped("pressure washer")).toEqual({ itemCategory: "outdoor", subType: "power-washer" })
  })

  it("returns nulls for unrecognized text", () => {
    expect(mapOcrCategoryToTyped("ab")).toEqual({ itemCategory: null, subType: null })
  })
})

describe("suggestedRoomForSubType", () => {
  it.each([
    ["washing-machine", "Laundry"],
    ["dryer", "Laundry"],
    ["dishwasher", "Kitchen"],
    ["refrigerator", "Kitchen"],
    ["coffee-maker", "Kitchen"],
    ["faucet", "Bathroom"],
    ["television", "Living"],
    ["grill", "Outdoor"],
  ])("%s → %s", (sub, room) => {
    expect(suggestedRoomForSubType(sub)).toBe(room)
  })

  it("returns null for sub-types with no strong room association", () => {
    expect(suggestedRoomForSubType("electrical-panel")).toBeNull()
    expect(suggestedRoomForSubType("roof")).toBeNull()
    expect(suggestedRoomForSubType(null)).toBeNull()
    expect(suggestedRoomForSubType(undefined)).toBeNull()
  })
})
