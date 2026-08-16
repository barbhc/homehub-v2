import { describe, expect, it } from "vitest"
import { manualSearchUrl } from "./manualSearch"

describe("manualSearchUrl", () => {
  it("builds an encoded Google search for brand + model", () => {
    const url = manualSearchUrl("LG", "WM4000HWA")
    expect(url).toBe("https://www.google.com/search?q=LG%20WM4000HWA%20owner's%20manual%20pdf")
  })

  it("trims whitespace and encodes special characters", () => {
    const url = manualSearchUrl("  Bosch ", " SHP878ZD5N & Co ")
    expect(url).toContain("Bosch%20SHP878ZD5N%20%26%20Co")
    expect(url.startsWith("https://www.google.com/search?q=")).toBe(true)
  })
})
