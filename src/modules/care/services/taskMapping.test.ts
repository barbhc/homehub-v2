import { describe, it, expect } from "vitest"
import { taskSource, effortToMinutes, frequencyToSchedule } from "./taskMapping"

describe("taskSource", () => {
  it("classifies any cleaning task as cleaning, regardless of scope", () => {
    expect(taskSource("item_unit", "cleaning")).toBe("cleaning")
    expect(taskSource("home", "cleaning")).toBe("cleaning")
  })
  it("classifies home-scope maintenance as home upkeep", () => {
    expect(taskSource("home", "maintenance")).toBe("home")
    expect(taskSource("home", null)).toBe("home")
  })
  it("classifies item-scope maintenance as appliance", () => {
    expect(taskSource("item_unit", "maintenance")).toBe("appliance")
    expect(taskSource("item_unit", null)).toBe("appliance")
  })
})

describe("effortToMinutes", () => {
  it("maps tiers to minutes", () => {
    expect(effortToMinutes("short")).toBe(15)
    expect(effortToMinutes("medium")).toBe(30)
    expect(effortToMinutes("long")).toBe(60)
  })
  it("returns null when effort is unset", () => {
    expect(effortToMinutes(null)).toBeNull()
    expect(effortToMinutes(undefined)).toBeNull()
  })
})

describe("frequencyToSchedule", () => {
  it("maps after-each-use", () => {
    expect(frequencyToSchedule({ afterEachUse: true, frequencyValue: null, frequencyUnit: null }))
      .toEqual({ schedule_type: "after_each_use", interval_days: null })
  })
  it("maps canonical cadences to named types", () => {
    expect(frequencyToSchedule({ frequencyValue: 1, frequencyUnit: "weeks" }))
      .toEqual({ schedule_type: "weekly", interval_days: null })
    expect(frequencyToSchedule({ frequencyValue: 1, frequencyUnit: "months" }))
      .toEqual({ schedule_type: "monthly", interval_days: null })
    expect(frequencyToSchedule({ frequencyValue: 3, frequencyUnit: "months" }))
      .toEqual({ schedule_type: "quarterly", interval_days: null })
    expect(frequencyToSchedule({ frequencyValue: 6, frequencyUnit: "months" }))
      .toEqual({ schedule_type: "semiannual", interval_days: null })
    expect(frequencyToSchedule({ frequencyValue: 1, frequencyUnit: "years" }))
      .toEqual({ schedule_type: "annual", interval_days: null })
  })
  it("maps non-canonical cadences to every_n_days", () => {
    expect(frequencyToSchedule({ frequencyValue: 10, frequencyUnit: "days" }))
      .toEqual({ schedule_type: "every_n_days", interval_days: 10 })
    expect(frequencyToSchedule({ frequencyValue: 2, frequencyUnit: "weeks" }))
      .toEqual({ schedule_type: "every_n_days", interval_days: 14 })
    expect(frequencyToSchedule({ frequencyValue: 2, frequencyUnit: "years" }))
      .toEqual({ schedule_type: "every_n_days", interval_days: 730 })
  })
  it("falls back to as_needed with no/invalid cadence", () => {
    expect(frequencyToSchedule({ frequencyValue: null, frequencyUnit: null }))
      .toEqual({ schedule_type: "as_needed", interval_days: null })
    expect(frequencyToSchedule({ frequencyValue: 0, frequencyUnit: "weeks" }))
      .toEqual({ schedule_type: "as_needed", interval_days: null })
  })
})
