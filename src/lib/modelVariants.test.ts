/**
 * The "Levoit Core Series Air Purifiers" regression (beta round 5).
 *
 * A Core 300 typed as "Core" produced an item named after the manufacturer's
 * FAMILY page, with "Core 300" sitting in the model field right above it. Two
 * independent faults had to line up, so both are pinned here:
 *
 *   1. mineVariants bailed on prefixes under 5 characters, so "CORE" (4) mined
 *      nothing — and the resolver only offers the "which one is yours?" pick
 *      when it has variants to offer.
 *   2. With no variants, a token-exact hit on a family page was accepted as
 *      the product, and its title became the item's name.
 */
import { describe, it, expect } from "vitest"
import {
  MIN_VARIANT_PREFIX,
  looksLikeSeriesTitle,
  mineVariants,
  normalizeModel,
} from "../../shared/products/modelVariants"

describe("normalizeModel", () => {
  it("strips punctuation and case so 'wm-4000h' and 'WM4000H' are one model", () => {
    expect(normalizeModel("wm-4000h")).toBe("WM4000H")
    expect(normalizeModel("Core 300")).toBe("CORE300")
  })
})

describe("mineVariants", () => {
  it("mines the Core family from a four-character prefix — the reported case", () => {
    const results = mineVariants("Core", [
      "Levoit Core 300 True HEPA Air Purifier",
      "Levoit Core 200S smart air purifier review",
      "Core 400S covers larger rooms",
    ])
    expect(results.map((v) => v.model).sort()).toEqual(["CORE200S", "CORE300", "CORE400S"])
  })

  it("still refuses prefixes below the floor — 'LG' must not match the catalogue", () => {
    expect(MIN_VARIANT_PREFIX).toBe(4)
    expect(mineVariants("LG", ["LG WM4000HWA", "LG WM3600HWA"])).toEqual([])
  })

  it("only extends the typed model, and only with something numeric", () => {
    // "COREX" extends CORE but carries no digit — a word, not a model.
    expect(mineVariants("Core", ["Corex cleaning wipes"])).toEqual([])
    // A different family is not a variant of this one.
    expect(mineVariants("Core", ["Levoit Vital 100S"])).toEqual([])
  })

  it("mines the SPACED form too — how search results actually write models", () => {
    // A token scan only ever saw "CORE300". Every spaced family was therefore
    // unminable, which is most of them.
    expect(mineVariants("Core", ["Levoit Core 300 True HEPA"])[0].model).toBe("CORE300")
    expect(mineVariants("Core", ["Levoit CORE300 air purifier"])[0].model).toBe("CORE300")
    expect(mineVariants("Core", ["Levoit Core-300 air purifier"])[0].model).toBe("CORE300")
  })

  it("does not join prose or pack counts into a fake model", () => {
    expect(mineVariants("Core", ["Core and 200 others"])).toEqual([])
    expect(mineVariants("Core", ["Core 2 pack"])).toEqual([])
  })

  it("caps at three so the pick list stays a choice, not a catalogue", () => {
    expect(
      mineVariants("Core", ["Core 100 Core 200 Core 300 Core 400 Core 500"]).length
    ).toBe(3)
  })
})

describe("looksLikeSeriesTitle", () => {
  it("catches the title that named the item wrongly", () => {
    expect(looksLikeSeriesTitle("Levoit Core Series Air Purifiers")).toBe(true)
  })

  it("catches the other family words", () => {
    expect(looksLikeSeriesTitle("Bosch 800 Series Dishwasher")).toBe(true)
    expect(looksLikeSeriesTitle("The Profile Collection")).toBe(true)
    expect(looksLikeSeriesTitle("Whirlpool Duet family")).toBe(true)
  })

  it("does NOT treat a plural product noun as a family page", () => {
    // Tried and withdrawn: live retail titles for ONE product are routinely
    // plural, so this rejected the products it was meant to protect.
    expect(looksLikeSeriesTitle("LEVOIT Air Purifiers for Home, Large Room")).toBe(false)
  })

  it("leaves a real single-product title alone", () => {
    // These must keep resolving, including the digit-less product names —
    // rejecting every model without a number would have broken them.
    expect(looksLikeSeriesTitle("Levoit Core 300 True HEPA Air Purifier")).toBe(false)
    expect(looksLikeSeriesTitle("Dyson Airwrap Multi-Styler")).toBe(false)
    expect(looksLikeSeriesTitle("Fisher & Paykel RF135BDRUX4 Refrigerator")).toBe(false)
    expect(looksLikeSeriesTitle("LG WM4000HWA Front Load Washer")).toBe(false)
  })
})
