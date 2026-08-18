/**
 * Reported: inventory items named "Amazon.com: Ninja DZ201 ...". The identity
 * resolver took the best search result's title verbatim, and a retailer listing
 * title is the store's SEO string, not a product name.
 */
import { describe, it, expect } from "vitest"
import { cleanProductTitle, isRetailerHost, hostOf, productDisplayName } from "../../shared/products/productTitle"

describe("cleanProductTitle", () => {
  it("strips the leading retailer prefix that was reaching item names", () => {
    expect(cleanProductTitle("Amazon.com: Ninja DZ201 Foodi 6-in-1 DualZone Air Fryer")).toBe(
      "Ninja DZ201 Foodi 6-in-1 DualZone Air Fryer",
    )
  })

  it("strips pipe and spaced-dash site chrome", () => {
    expect(cleanProductTitle("Ninja DZ201 Air Fryer | Best Buy")).toBe("Ninja DZ201 Air Fryer")
    expect(cleanProductTitle("Ninja DZ201 Air Fryer - Walmart.com")).toBe("Ninja DZ201 Air Fryer")
  })

  it("never eats a dash inside a model number", () => {
    expect(cleanProductTitle("Coway AP-1512HH Mighty Air Purifier")).toBe("Coway AP-1512HH Mighty Air Purifier")
  })

  it("leaves a real title that merely contains a colon alone", () => {
    // The strip only fires for something recognisably a store.
    expect(cleanProductTitle("Air Fryer: The Complete Guide")).toBe("Air Fryer: The Complete Guide")
    expect(cleanProductTitle("Ninja DZ201: Dual Zone Air Fryer")).toBe("Ninja DZ201: Dual Zone Air Fryer")
  })
})

describe("isRetailerHost / hostOf", () => {
  it("recognises the stores whose titles caused this", () => {
    expect(isRetailerHost(hostOf("https://www.amazon.com/dp/B08...")))
      .toBe(true)
    expect(isRetailerHost(hostOf("https://www.bestbuy.com/site/..."))).toBe(true)
  })

  it("does not treat a manufacturer as a retailer", () => {
    expect(isRetailerHost(hostOf("https://www.ninjakitchen.com/products/dz201"))).toBe(false)
    expect(isRetailerHost(hostOf("https://www.lg.com/us/washers"))).toBe(false)
  })

  it("treats a malformed url as unknown rather than throwing", () => {
    expect(hostOf("not a url")).toBeNull()
    expect(isRetailerHost(null)).toBe(false)
  })
})

describe("productDisplayName", () => {
  it("uses brand + model when the title is marketing copy", () => {
    // The real Brave hit for a Levoit Core 300 (beta round 5). Taken verbatim
    // this became the heading on the item page.
    const title =
      "LEVOIT Core 300 Purifier with Replacement Filter - HEPA Air Cleaner " +
      "Eliminates Allergens for Bedroom, Pets, Smokers In 1"
    expect(productDisplayName(title, "Levoit", "Core 300")).toBe("Levoit Core 300")
  })

  it("keeps a short title — sometimes the product name beats the model number", () => {
    expect(productDisplayName("Dyson Airwrap Multi-Styler", "Dyson", "HS05")).toBe(
      "Dyson Airwrap Multi-Styler"
    )
  })

  it("strips trailing listing furniture before measuring", () => {
    expect(
      productDisplayName("4.5 cu. ft. Front Load Washer - WM4000HWA + Reviews", "LG", "WM4000HWA")
    ).toBe("4.5 cu. ft. Front Load Washer - WM4000HWA")
  })

  it("falls back to the title when there is no brand or model to compose", () => {
    const long = "A".repeat(80)
    expect(productDisplayName(long, "", "")).toBe(long)
  })
})
