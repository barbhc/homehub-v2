/**
 * Deriving a brand from a model number — the fix for an LG dryer that scanned
 * as a Whirlpool.
 *
 * Every case here is a way the derivation could become the thing it replaces:
 * a confident wrong answer. The happy path is the least interesting test.
 */
import { describe, it, expect } from "vitest"
import { isDistinctiveModel, knownBrandIn, pickBrandFromResults } from "./brands"

describe("isDistinctiveModel", () => {
  it("accepts real appliance model numbers", () => {
    for (const m of ["WM3900HBA", "DLGX3901B", "AP-1512HH", "SHPM65Z55N"]) {
      expect(isDistinctiveModel(m), m).toBe(true)
    }
  })

  it("rejects the strings that collide across every brand", () => {
    for (const m of ["300", "A1", "PRO", "XL", "Core"]) {
      expect(isDistinctiveModel(m), m).toBe(false)
    }
  })
})

describe("knownBrandIn", () => {
  it("finds a brand on the closed list", () => {
    expect(knownBrandIn("LG WM3900HBA Front Load Washer")).toBe("LG")
  })

  it("prefers the longer brand when a title carries both", () => {
    expect(knownBrandIn("GE Profile PVD28BYNFS Refrigerator")).toBe("GE Profile")
  })

  it("does not match a brand sitting inside another word", () => {
    // "LG" is inside "Bulgarian"; a substring check would fire here.
    expect(knownBrandIn("Bulgarian appliance importer")).toBeNull()
  })

  it("returns null for a brand we do not know", () => {
    // Not a discovery — an unverified string. The closed list is the point.
    expect(knownBrandIn("Zanussi ZWF80240W washing machine")).toBeNull()
  })
})

describe("pickBrandFromResults", () => {
  it("derives LG from an LG model number", () => {
    expect(
      pickBrandFromResults(
        [
          { title: "LG WM3900HBA 4.5 cu.ft. Front Load Washer", url: "https://www.lg.com/us/washers/wm3900hba" },
          { title: "LG WM3900HBA Reviews", url: "https://www.consumerreports.org/x" },
        ],
        "WM3900HBA",
      ),
    ).toEqual({ brand: "LG", agreeing: 2 })
  })

  it("refuses a model too generic to identify anyone", () => {
    expect(pickBrandFromResults([{ title: "Levoit Core 300 Air Purifier", url: "https://levoit.com" }], "300")).toBeNull()
  })

  it("ignores pages that do not name the model", () => {
    // A category page proves the brand makes washers, not that it makes THIS one.
    expect(
      pickBrandFromResults([{ title: "LG Front Load Washers", url: "https://www.lg.com/us/washers" }], "WM3900HBA"),
    ).toBeNull()
  })

  it("will not accept a lone retailer listing", () => {
    // One store title is how an item once ended up named "Amazon.com: Ninja …".
    expect(
      pickBrandFromResults([{ title: "Amazon.com: LG WM3900HBA Washer", url: "https://www.amazon.com/dp/X" }], "WM3900HBA"),
    ).toBeNull()
  })

  it("accepts a single non-retailer hit", () => {
    expect(
      pickBrandFromResults(
        [{ title: "LG WM3900HBA Front Load Washer", url: "https://www.lg.com/us/washers/wm3900hba" }],
        "WM3900HBA",
      ),
    ).toEqual({ brand: "LG", agreeing: 1 })
  })

  it("reports nothing when the evidence is split", () => {
    // A tie means the model was not as distinctive as it looked. Taking the
    // bigger pile by one vote is exactly the guess this change removes.
    expect(
      pickBrandFromResults(
        [
          { title: "LG ABC123 Dryer", url: "https://www.lg.com/x" },
          { title: "Samsung ABC123 Dryer", url: "https://www.samsung.com/x" },
        ],
        "ABC123",
      ),
    ).toBeNull()
  })

  it("reads the brand from a description when the title omits it", () => {
    expect(
      pickBrandFromResults(
        [{ title: "WM3900HBA Front Load Washer", description: "Official LG product page", url: "https://www.lg.com/x" }],
        "WM3900HBA",
      ),
    ).toEqual({ brand: "LG", agreeing: 1 })
  })
})
