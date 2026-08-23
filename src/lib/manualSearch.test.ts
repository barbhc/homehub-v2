import { describe, expect, it } from "vitest"
import { manualSearchUrl } from "./manualSearch"
import { displayTitle } from "../../shared/products/documentKind"

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

/**
 * HH-72 — the pre-filled search behind the link.
 *
 * The owner reported this as a MISSING feature while looking at the screen it
 * lives on, because the link was labelled "Search the web yourself". These pin
 * the half that made that label a lie: the query is already written for you.
 */
describe("HH-72 — what the link actually hands Google", () => {
  it("includes the brand, the model, and what kind of document", () => {
    const q = decodeURIComponent(new URL(manualSearchUrl("LG", "DLGX3901B")).searchParams.get("q")!)
    expect(q).toContain("LG")
    expect(q).toContain("DLGX3901B")
    expect(q).toMatch(/owner'?s manual/i)
  })

  it("does not leave a double space when the model is missing", () => {
    // The add flow can reach this with a brand and no model yet, and
    // "LG  owner's manual pdf" is a worse search than "LG owner's manual pdf".
    const q = new URL(manualSearchUrl("LG", "")).searchParams.get("q")!
    expect(q).not.toMatch(/\s{2,}/)
    expect(q).toBe("LG owner's manual pdf")
  })
})

/**
 * HH-105: a manufacturer's page title came back as the literal string
 * "seo.defaults.title" — their untranslated placeholder — and the manual
 * preview printed it as the document's name.
 */
describe("displayTitle — placeholder keys are not titles", () => {
  it("falls back to the source when the title is an i18n key", () => {
    expect(displayTitle("seo.defaults.title", "https://ninjakitchen.com/x.pdf", "ninjakitchen.com"))
      .toBe("ninjakitchen.com")
  })
  it("leaves real titles with dots alone", () => {
    expect(displayTitle("Model AF101 v2.1 Owner's Manual", "https://x.com/a.pdf", "x.com"))
      .toBe("Model AF101 v2.1 Owner's Manual")
  })
})
