/**
 * The first list (D8). The four worked examples are the approved mock
 * (https://claude.ai/artifact/2VnY3jhXgB2ALEVkB8CzQC) — each row, its order,
 * which rows ask, and what "Not on your list" names.
 */
import { describe, expect, it } from "vitest"
import table from "../../src/data/zip-area.json"
import { lookupZip, type ZipAreaTable } from "../area/zipArea"
import { firstList, type FirstListInput, type HomeType } from "./firstList"

const T = table as unknown as ZipAreaTable

/** What onboarding passes for a zip + home type, before any answer. */
function fromZip(zip: string, homeType: HomeType, month: number): FirstListInput {
  const a = lookupZip(T, zip)!
  const condoish = homeType === "condo" || homeType === "apartment"
  return {
    month,
    climate: a.climate,
    freezeRisk: a.freezeRisk,
    homeType,
    hazards: a.hazards.map((h) => h.hazard),
    facts: condoish ? { building_handles_exterior: true } : {},
    derived: { freezeRisk: true, buildingHandlesExterior: condoish },
    hasArea: true,
    observesDst: a.observesDst,
  }
}
const keys = (l: ReturnType<typeof firstList>) => l.rows.map((r) => r.entry.key)
const asks = (l: ReturnType<typeof firstList>) => l.rows.map((r) => !!r.question)

describe("the mock's worked examples", () => {
  it("condo, 94110, November: alarms ✓ · air filter (asks) · quake straps (asks); winterizing and gutters named", () => {
    const l = firstList(fromZip("94110", "condo", 11))
    expect(keys(l)).toEqual(["home.alarm_test", "home.air_filter", "home.quake_straps"])
    expect(asks(l)).toEqual([false, true, true])
    expect(l.rows[0].checked).toBe(true)
    expect(l.leftOff.map((x) => x.label)).toEqual(["Winterizing: it rarely freezes here.", "Roof and gutters: usually the building’s job in a condo."])
    expect(l.rows.map((r) => r.reason)).toEqual(["The clocks changed this month. Test them together.", "Heating season starts here this month.", "High earthquake risk in this county."])
    expect(l.rows.map((r) => r.question?.text ?? null)).toEqual([null, "Do you have a furnace or central air?", "Is there a water heater in your unit?"])
  })
  it("house, 55406, November: alarms ✓ · outdoor taps 'if not done yet' (asks) · air filter (asks); nothing left off", () => {
    const l = firstList(fromZip("55406", "house", 11))
    expect(keys(l)).toEqual(["home.alarm_test", "home.outdoor_taps", "home.air_filter"])
    expect(asks(l)).toEqual([false, true, true])
    expect(l.rows[1].ifNotDoneYet).toBe(true)
    expect(l.leftOff).toEqual([])
    expect(l.rows.map((r) => r.reason)).toEqual(["The clocks changed this month. Test them together.", "If not done yet. Hard freezes start here in November.", "Heating season is under way here."])
    expect(l.rows.map((r) => r.question?.text ?? null)).toEqual([null, "Any outdoor taps or hose bibs?", "Does the furnace take a filter?"])
  })
  it("condo, 33139, May: hurricane season ✓ · air filter (asks)", () => {
    const l = firstList(fromZip("33139", "condo", 5))
    expect(keys(l)).toEqual(["home.hurricane_prep", "home.air_filter"])
    expect(asks(l)).toEqual([false, true])
  })
  it("no zip, November: alarms ✓ · air filter (asks), nothing left off", () => {
    const l = firstList({ month: 11, climate: null, freezeRisk: null, homeType: null, hazards: [], facts: {}, derived: { freezeRisk: false, buildingHandlesExterior: false }, hasArea: false, observesDst: null })
    expect(keys(l)).toEqual(["home.alarm_test", "home.air_filter"])
    expect(l.leftOff).toEqual([])
    expect(l.rows.map((r) => r.reason)).toEqual(["Fall is a good time for the first one.", "Heating season starts in most places this month."])
  })
})

describe("must-be-true", () => {
  it("7: never more than three rows or two questions, in any month, anywhere", () => {
    for (const zip of ["94110", "55406", "33139", "85004", "90210", "98101", "02134", "70112"]) {
      for (const type of ["house", "condo", "townhouse", "apartment"] as HomeType[]) {
        for (let m = 1; m <= 12; m++) {
          const l = firstList(fromZip(zip, type, m))
          expect(l.rows.length).toBeLessThanOrEqual(3)
          expect(l.rows.filter((r) => r.question).length).toBeLessThanOrEqual(2)
          expect(l.leftOff.length).toBeLessThanOrEqual(2)
        }
      }
    }
  })
  it("9: a row with an open question is never pre-checked", () => {
    for (let m = 1; m <= 12; m++) {
      for (const r of firstList(fromZip("55406", "house", m)).rows) expect(r.checked).toBe(!r.question)
    }
  })
  it("10: a freeze-free zip never shows winterizing, in any month or home type", () => {
    for (const type of ["house", "townhouse", "condo"] as HomeType[]) {
      for (let m = 1; m <= 12; m++) expect(keys(firstList(fromZip("94110", type, m)))).not.toContain("home.outdoor_taps")
    }
  })
})

describe("must-be-true 15: clock copy", () => {
  it("never in a state that keeps standard time (Phoenix, November)", () => {
    for (const r of firstList(fromZip("85004", "house", 11)).rows) expect(r.reason ?? "").not.toMatch(/clock/i)
  })
  it("never on the no-zip list, in any month", () => {
    for (let m = 1; m <= 12; m++) {
      const l = firstList({ month: m, climate: null, freezeRisk: null, homeType: null, hazards: [], facts: {}, derived: { freezeRisk: false, buildingHandlesExterior: false }, hasArea: false, observesDst: null })
      for (const r of l.rows) expect(r.reason ?? "").not.toMatch(/clock/i)
    }
  })
})

describe("the rules", () => {
  it("Useful: Optional work never appears", () => {
    for (let m = 1; m <= 12; m++) for (const r of firstList(fromZip("55406", "house", m)).rows) expect(r.entry.priorityTier).not.toBe("optional")
  })
  it("one row per system: the furnace service never sits beside the filter", () => {
    for (let m = 1; m <= 12; m++) {
      const k = keys(firstList(fromZip("55406", "house", m)))
      expect(k.includes("home.air_filter") && k.includes("home.hvac_service")).toBe(false)
    }
  })
  it("an answered No removes the row; an answered Yes pre-checks it", () => {
    const base = fromZip("94110", "condo", 11)
    expect(keys(firstList({ ...base, facts: { ...base.facts, has_air_filter: false } }))).not.toContain("home.air_filter")
    const yes = firstList({ ...base, facts: { ...base.facts, has_air_filter: true } })
    expect(yes.rows.find((r) => r.entry.key === "home.air_filter")).toMatchObject({ question: null, checked: true })
  })
  it("a 'Not true here' on freeze puts winterizing back for a house", () => {
    const base = fromZip("94110", "house", 11)
    const corrected = firstList({ ...base, freezeRisk: true, derived: { ...base.derived, freezeRisk: false } })
    expect(keys(corrected)).toContain("home.outdoor_taps")
    expect(corrected.leftOff.map((x) => x.reason)).not.toContain("freeze_free")
  })
  it("a 'Not true here' on the earthquake rating takes the quake straps away", () => {
    const base = fromZip("94110", "condo", 11)
    expect(keys(firstList({ ...base, hazards: [] }))).not.toContain("home.quake_straps")
  })
  it("a freeze-free answer the OWNER gave is hers, not a default: never named under Not on your list", () => {
    const base = fromZip("94110", "house", 11)
    expect(firstList({ ...base, derived: { ...base.derived, freezeRisk: false } }).leftOff.map((x) => x.reason)).not.toContain("freeze_free")
  })
  it("names only what would have been timely anyway: no winterizing in May", () => {
    expect(firstList(fromZip("94110", "condo", 5)).leftOff.map((x) => x.reason)).not.toContain("freeze_free")
  })
  it("fills a short list to two with any-month work", () => {
    // July, Minneapolis house: nothing seasonal is timely.
    const l = firstList(fromZip("55406", "house", 7))
    expect(l.rows.length).toBe(2)
  })
  it("a task the home already has, or a dismissed one, is never offered", () => {
    const base = fromZip("94110", "condo", 11)
    expect(keys(firstList({ ...base, existing: [{ title: "Test smoke and CO alarms", scheduleType: "semiannual" }] }))).not.toContain("home.alarm_test")
    expect(keys(firstList({ ...base, dismissed: ["home.air_filter"] }))).not.toContain("home.air_filter")
  })
  it("an alarm test opening next month is already worth doing (February → March window)", () => {
    expect(keys(firstList(fromZip("55406", "house", 2)))).toContain("home.alarm_test")
  })
})
