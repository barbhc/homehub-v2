import { describe, expect, it } from "vitest"
import { buildZipArea, hazardRating, parseDbf, parseDelimited, ratingOf } from "./zipAreaBuild.js"

const SOURCES = { hardiness: "h", zipToCounty: "z", hazards: "f", climateZones: "p" }

const ZIP_COUNTY = [
  "OID_ZCTA5_20|GEOID_ZCTA5_20|GEOID_COUNTY_20|AREALAND_PART",
  "1|11111|06075|100",
  // 22222 crosses two counties; most of its land is in 06081.
  "2|22222|06075|10",
  "3|22222|06081|90",
  // 33333 is an old Connecticut county FEMA no longer rates.
  "4|33333|09003|50",
].join("\n")

// RISKR is FEMA's overall rating; ALR_NPCTL its per-building loss percentile.
// A high rating stands only with a loss percentile of 70 or more (Cook's 51
// drops its "Relatively High" earthquake to 3, below what is shown).
const HAZARDS = [
  "STATEABBRV,COUNTY,COUNTYTYPE,STCOFIPS,ERQK_RISKR,WFIR_RISKR,HRCN_RISKR,ERQK_ALR_NPCTL,WFIR_ALR_NPCTL,HRCN_ALR_NPCTL",
  "CA,San Francisco,County,06075,Very High,Very Low,Not Applicable,76.5,1.49,",
  'CA,"San Mateo, Odd",County,06081,Relatively High,Relatively Moderate,Insufficient Data,96.1,72.0,',
  "CT,Capitol,Planning Region,09110,Relatively Moderate,Very Low,Relatively High,40,5,75",
  "IL,Cook,County,17031,Relatively High,Very Low,Very Low,51.05,0.86,6.9",
].join("\r\n")

const HARDINESS = ["zipcode,zone,trange,zonetitle", "11111,10b,35 to 40,10b: 35 to 40", "44444,7a,0 to 5,7a: 0 to 5", "55555,bad,,"].join("\n")

const ZONES = [
  { GEOID: "G06075", Country: "San Francisco", IECC21: "3", Moisture21: "C" },
  { GEOID: "G06081", Country: "San Mateo", IECC21: "3", Moisture21: "C" },
  { GEOID: "G09003", Country: "Hartford", IECC21: "5", Moisture21: "A" },
]

const build = () => buildZipArea({ hardinessCsv: HARDINESS, zipCountyTxt: ZIP_COUNTY, hazardsCsv: HAZARDS, climateZones: ZONES, built: "2026-11-19", sources: SOURCES })

describe("buildZipArea", () => {
  it("joins a zip to its zone and county", () => {
    const t = build()
    expect(t.zips["11111"]).toEqual(["10b", "06075", 1])
    expect(t.counties["06075"]).toEqual(["San Francisco County", "CA", 3, "C", 5, 1, 0])
  })
  it("a zip crossing counties takes the one with the most land, and says how many it touches", () => {
    expect(build().zips["22222"]).toEqual(["", "06081", 2])
  })
  it("reads quoted names and treats a blank loss rate as no rating", () => {
    expect(build().counties["06081"]).toEqual(["San Mateo, Odd County", "CA", 3, "C", 4, 3, 0])
  })
  it("an old Connecticut county keeps its climate zone and carries no hazard rating", () => {
    expect(build().counties["09003"]).toEqual(["Hartford", "CT", 5, "A", 0, 0, 0])
  })
  it("keeps a zip only the hardiness file knows (a PO box) and drops malformed zones", () => {
    const t = build()
    expect(t.zips["44444"]).toEqual(["7a", "", 0])
    expect(t.zips["55555"]).toBeUndefined()
  })
  it("lists only counties some zip uses", () => {
    expect(Object.keys(build().counties).sort()).toEqual(["06075", "06081", "09003"])
  })
})

describe("parsers", () => {
  it("parseDelimited handles a BOM, doubled quotes and CRLF", () => {
    expect(parseDelimited('﻿a,b\r\n"x ""y""",2\r\n')).toEqual([{ a: 'x "y"', b: "2" }])
  })
  it("ratingOf maps FEMA's labels", () => {
    expect(ratingOf("Very High")).toBe(5)
    expect(ratingOf("Relatively High")).toBe(4)
    expect(ratingOf("No Rating")).toBe(0)
    expect(ratingOf(undefined)).toBe(0)
  })
  it("a high rating stands only with a top-30% per-building loss rate", () => {
    expect(hazardRating("Relatively High", "51.05")).toBe(3) // Cook County earthquake: not shown
    expect(hazardRating("Very High", "76.5")).toBe(5) // San Francisco earthquake: shown
    expect(hazardRating("Relatively High", "70")).toBe(4)
    expect(hazardRating("Relatively High", "")).toBe(3) // no loss rate: not shown
    expect(hazardRating("Relatively Low", "99")).toBe(2) // a high loss rate never raises a rating
    expect(hazardRating("Not Applicable", "")).toBe(0)
  })
  it("parseDbf reads a minimal dBASE table and skips deleted rows", () => {
    const field = (name: string, len: number) => {
      const f = new Uint8Array(32)
      f.set(new TextEncoder().encode(name))
      f[11] = 0x43 // 'C'
      f[16] = len
      return f
    }
    const header = new Uint8Array(32)
    const view = new DataView(header.buffer)
    const recLen = 1 + 6 + 2
    view.setUint32(4, 2, true)
    view.setUint16(8, 32 + 64 + 1, true)
    view.setUint16(10, recLen, true)
    const rec = (flag: string, a: string, b: string) => new TextEncoder().encode(flag + a.padEnd(6) + b.padEnd(2))
    const parts = [header, field("GEOID", 6), field("IECC21", 2), new Uint8Array([0x0d]), rec(" ", "G06075", "3"), rec("*", "G99999", "9")]
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let off = 0
    for (const p of parts) { buf.set(p, off); off += p.length }
    expect(parseDbf(buf)).toEqual([{ GEOID: "G06075", IECC21: "3" }])
  })
})
