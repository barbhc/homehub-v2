import { describe, expect, it } from "vitest"
import table from "../../src/data/zip-area.json"
import {
  climateFrom, coldestNightF, freezeRiskFromZone, lookupZip, normalizeZip, observesDst, zoneValue,
  type ZipAreaTable,
} from "./zipArea"

const T = table as unknown as ZipAreaTable

describe("zone arithmetic", () => {
  it("reads half-zones", () => {
    expect(zoneValue("10b")).toBe(10.5)
    expect(zoneValue("7a")).toBe(7)
    expect(zoneValue("10")).toBeNull()
    expect(zoneValue("")).toBeNull()
  })
  it("says what a zone's coldest nights are, on USDA's 5°F steps", () => {
    expect(coldestNightF("10b")).toEqual([35, 40])
    expect(coldestNightF("5a")).toEqual([-20, -15])
    expect(coldestNightF("11a")).toEqual([40, 45])
  })
})

describe("freeze risk: false only at zone 10a or warmer", () => {
  it.each([["10a", false], ["13b", false], ["9b", true], ["9a", true], ["5a", true]] as const)("%s → %s", (zone, want) => {
    expect(freezeRiskFromZone(zone)).toBe(want)
  })
  it("no zone is unknown, never false", () => expect(freezeRiskFromZone("")).toBeNull())
})

describe("climate band", () => {
  it("cold ≤ 6b, moderate 7a–9b, mild ≥ 10a", () => {
    expect(climateFrom("6b", 5)).toBe("cold")
    expect(climateFrom("7a", 4)).toBe("moderate")
    expect(climateFrom("9b", 3)).toBe("moderate")
    expect(climateFrom("10a", 3)).toBe("mild")
  })
  it("IECC zone 1 or 2 is hot, whatever the winter", () => {
    expect(climateFrom("9a", 2)).toBe("hot")
    expect(climateFrom("11a", 1)).toBe("hot")
  })
  it("no zone and no IECC is unknown", () => expect(climateFrom("", null)).toBeNull())
})

describe("clock changes", () => {
  it("Arizona and Hawaii keep standard time", () => {
    expect(observesDst("AZ")).toBe(false)
    expect(observesDst("HI")).toBe(false)
    expect(observesDst("CA")).toBe(true)
    expect(observesDst("")).toBeNull()
  })
})

describe("the shipped table — the spec's worked examples", () => {
  it("94110, San Francisco: freeze-free, mild, earthquake shown, clocks change", () => {
    const a = lookupZip(T, "94110")!
    expect(a.hardinessZone).toBe("10b")
    expect(a.freezeRisk).toBe(false)
    expect(a.climate).toBe("mild")
    expect(a.county?.name).toBe("San Francisco County")
    expect(a.hazards.map((h) => h.hazard)).toEqual(["earthquake"])
    expect(a.observesDst).toBe(true)
  })
  it("55406, Minneapolis: cold, freezes, no area hazard to show", () => {
    const a = lookupZip(T, "55406")!
    expect(a.hardinessZone).toBe("5a")
    expect(a.freezeRisk).toBe(true)
    expect(a.climate).toBe("cold")
    expect(a.hazards).toEqual([])
  })
  it("33139, Miami Beach: hot, hurricane shown", () => {
    const a = lookupZip(T, "33139")!
    expect(a.climate).toBe("hot")
    expect(a.hazards.map((h) => h.hazard)).toContain("hurricane")
  })
  it("a Connecticut zip carries no hazard (FEMA rates planning regions the zip file cannot place)", () => {
    const a = lookupZip(T, "06103")! // Hartford
    expect(a.county?.state).toBe("CT")
    expect(a.hazards).toEqual([])
    expect(a.iecc).toBe(5)
  })
  it("an unknown or malformed zip is null — the screen offers the climate choices instead", () => {
    expect(lookupZip(T, "00000")).toBeNull()
    expect(lookupZip(T, "9411")).toBeNull()
    expect(lookupZip(T, "SW1A 1AA")).toBeNull()
  })
  it("records where every value came from and when the table was built", () => {
    expect(T.version.built).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Object.keys(T.version.sources).sort()).toEqual(["climateZones", "hardiness", "hazards", "zipToCounty"])
  })
  it("trims, and refuses anything but five digits", () => {
    expect(normalizeZip(" 94110 ")).toBe("94110")
    expect(normalizeZip("94110-1234")).toBeNull()
  })
})
