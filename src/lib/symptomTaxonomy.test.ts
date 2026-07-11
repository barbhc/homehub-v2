import { describe, it, expect } from "vitest"
import { matchSymptomFromText } from "./symptomTaxonomy"

describe("matchSymptomFromText", () => {
  it("maps a leak description to 'leaking'", () => {
    expect(matchSymptomFromText("it's leaking from the bottom")).toBe("leaking")
  })

  it("maps a 'won't turn on' description to 'wont_start'", () => {
    expect(matchSymptomFromText("the dishwasher won't turn on at all")).toBe("wont_start")
  })

  it("maps a grinding noise to 'noise'", () => {
    expect(matchSymptomFromText("loud grinding noise during the spin cycle")).toBe("noise")
  })

  it("returns null for unrecognized or empty text", () => {
    expect(matchSymptomFromText("xyzzy foobar quux")).toBeNull()
    expect(matchSymptomFromText("")).toBeNull()
  })
})
