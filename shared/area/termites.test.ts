import { describe, expect, it } from "vitest"
import table from "../../src/data/zip-area.json"
import { lookupZip, type ZipAreaTable } from "./zipArea"
import { COUNTY_LISTS, countyKey, termitesCommon } from "./termites"

const T = table as unknown as ZipAreaTable
const fromZip = (zip: string) => {
  const c = lookupZip(T, zip)!.county!
  return termitesCommon(c.state, c.name)
}

describe("termites by county (VA wood-destroying-insect list, July 2025)", () => {
  it("every county the VA names is a county in the zip table — a typo would silently drop it", () => {
    for (const [state, names] of Object.entries(COUNTY_LISTS)) {
      const have = new Set(Object.values(T.counties).filter((c) => c[1] === state).map((c) => countyKey(c[0])))
      for (const n of names) expect([state, n, have.has(countyKey(n))]).toEqual([state, n, true])
    }
  })
  it.each([
    ["75201", true], // Dallas, TX: the whole state
    ["85004", true], // Phoenix, AZ
    ["94110", true], // San Francisco, CA
    ["55401", false], // Minneapolis, MN: not on the list
    ["98101", false], // Seattle, WA
    ["10001", true], // Manhattan: New York County is listed
    ["14201", false], // Buffalo: Erie County, NY is not
    ["48201", true], // Detroit: Wayne County, MI
    ["49855", false], // Marquette, MI
    ["89701", true], // Carson City, NV (the table's "Carson City City")
  ])("%s → %s", (zip, want) => expect(fromZip(zip)).toBe(want))
  it("an unknown county is unknown, never false", () => {
    expect(termitesCommon(null, "Dallas County")).toBeNull()
    expect(termitesCommon("TX", null)).toBeNull()
  })
})
