/**
 * The Settings zip rule (D8 edge case; mock https://claude.ai/artifact/CvrAvWEQr7wGao9wbAAtUm,
 * approved 2026-11-19): an owner's own climate answer is never overwritten by
 * a zip — it is offered, and written only on "Use the zip's".
 */
import { describe, expect, it } from "vitest"
import { climateOffer, climateOrigin, climatePatch, ownerSetClimate, shownClimate, type ZipClimateInput } from "./zipClimate"
import type { ZipArea } from "../../../shared/area/zipArea"

const SF: ZipArea = {
  zip: "94110", hardinessZone: "10b", coldestNightF: [35, 40],
  county: { fips: "06075", name: "San Francisco County", state: "CA", touches: 1 },
  iecc: 3, freezeRisk: false, climate: "mild",
  hazards: [{ hazard: "earthquake", rating: 5, label: "Very High" }], observesDst: true, tableVersion: "2026-11-19",
}

const input = (over: Partial<ZipClimateInput> = {}): ZipClimateInput => ({
  saved: { climate: null, freeze_risk: null, climate_source: null },
  pending: SF, useZip: false, picked: null, freezeFix: null, ...over,
})

describe("ownerSetClimate", () => {
  it("a pre-D8 answer (no source) is the owner's", () => {
    expect(ownerSetClimate({ climate: "moderate", freeze_risk: true, climate_source: null })).toBe(true)
  })
  it("an 'owner' source is the owner's, even with only freeze risk set", () => {
    expect(ownerSetClimate({ climate: null, freeze_risk: true, climate_source: "owner" })).toBe(true)
  })
  it("a zip-derived answer, or no answer, is not", () => {
    expect(ownerSetClimate({ climate: "mild", freeze_risk: false, climate_source: "zip" })).toBe(false)
    expect(ownerSetClimate({ climate: null, freeze_risk: null, climate_source: null })).toBe(false)
  })
})

describe("a home with no climate answer", () => {
  it("takes the zip's climate and freeze risk, sourced 'zip'", () => {
    const i = input()
    expect(climateOrigin(i)).toBe("zip")
    expect(shownClimate(i)).toBe("mild")
    expect(climateOffer(i)).toBeNull()
    expect(climatePatch(i)).toEqual({ climate: "mild", freeze_risk: false, climate_source: "zip" })
  })
  it("a corrected freeze fact is written as the owner's", () => {
    expect(climatePatch(input({ freezeFix: true }))).toEqual({ climate: "mild", freeze_risk: true, climate_source: "owner" })
  })
  it("a climate she picks wins over the zip's", () => {
    expect(climatePatch(input({ picked: "cold" }))).toEqual({ climate: "cold", freeze_risk: true, climate_source: "owner" })
  })
})

describe("a home whose climate came from an earlier zip", () => {
  it("takes the new zip's values", () => {
    const i = input({ saved: { climate: "cold", freeze_risk: true, climate_source: "zip" } })
    expect(climatePatch(i)).toEqual({ climate: "mild", freeze_risk: false, climate_source: "zip" })
  })
})

describe("an owner's own answer is NEVER overwritten", () => {
  const owner = { climate: "moderate" as const, freeze_risk: true, climate_source: null }

  it("shows her answer and offers the zip's", () => {
    const i = input({ saved: owner })
    expect(shownClimate(i)).toBe("moderate")
    expect(climateOffer(i)).toEqual({ climate: "mild", freeze_risk: false })
  })
  it("Save without tapping Use writes no climate or freeze risk — only that the pre-D8 answer is hers", () => {
    const patch = climatePatch(input({ saved: owner }))
    expect(patch).toEqual({ climate_source: "owner" })
    expect("climate" in patch).toBe(false)
    expect("freeze_risk" in patch).toBe(false)
  })
  it("an 'owner' answer is left completely untouched", () => {
    expect(climatePatch(input({ saved: { ...owner, climate_source: "owner" } }))).toEqual({})
  })
  it("a freeze-only answer is not overwritten either", () => {
    const i = input({ saved: { climate: null, freeze_risk: true, climate_source: "owner" } })
    expect(climatePatch(i)).toEqual({})
    expect(climateOffer(i)).toEqual({ climate: "mild", freeze_risk: false })
  })
  it("'Use the zip's' writes the zip's values", () => {
    const i = input({ saved: owner, useZip: true })
    expect(shownClimate(i)).toBe("mild")
    expect(climateOffer(i)).toBeNull()
    expect(climatePatch(i)).toEqual({ climate: "mild", freeze_risk: false, climate_source: "zip" })
  })
  it("no offer when the zip agrees with her", () => {
    expect(climateOffer(input({ saved: { climate: "mild", freeze_risk: false, climate_source: null } }))).toBeNull()
  })
  it("a corrected freeze fact that now agrees with her ends the offer", () => {
    const i = input({ saved: { climate: "mild", freeze_risk: true, climate_source: "owner" }, freezeFix: true })
    expect(climateOffer(i)).toBeNull()
  })
  it("no offer while she picks her own", () => {
    expect(climateOffer(input({ saved: owner, picked: "cold" }))).toBeNull()
  })
})

describe("no zip pending", () => {
  it("a re-save writes no climate fields, so a zip's finer freeze answer survives", () => {
    const i = input({ pending: null, saved: { climate: "hot", freeze_risk: true, climate_source: "zip" } })
    expect(climateOrigin(i)).toBe("saved")
    expect(climatePatch(i)).toEqual({})
  })
  it("re-picking the saved climate is not a change", () => {
    expect(climatePatch(input({ pending: null, saved: { climate: "mild", freeze_risk: false, climate_source: "zip" }, picked: "mild" }))).toEqual({})
  })
  it("picking a different climate is the owner's answer", () => {
    expect(climatePatch(input({ pending: null, saved: { climate: "mild", freeze_risk: false, climate_source: "zip" }, picked: "cold" })))
      .toEqual({ climate: "cold", freeze_risk: true, climate_source: "owner" })
  })
})

describe("a zip with no hardiness zone", () => {
  it("changes no climate fields", () => {
    const i = input({ pending: { ...SF, climate: null, freezeRisk: null, hardinessZone: null } })
    expect(climateOrigin(i)).toBe("saved")
    expect(climatePatch(i)).toEqual({})
  })
})
