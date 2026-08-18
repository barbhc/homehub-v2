/**
 * The four results a real "Levoit Core 300 manual" search returned (2026-08-18).
 * One was the manufacturer's CDN. Three were government hosts serving scraped
 * appliance PDFs, and nothing rejected them — ranking only ever sorted, so all
 * four were offered as things to point the task parser at.
 */
import { describe, it, expect } from "vitest"
import { isInstitutionalHost, namesProduct, isOfferableManual } from "../../shared/products/manualCandidates"

const live = [
  { title: "Levoit Core 300S user manual", url: "https://files.vesync.com/manuals/core300s.pdf", host: "files.vesync.com" },
  { title: "levoit core 300 air purifier manual", url: "https://jfd.jacksonrms.gov/x/levoit.pdf", host: "jfd.jacksonrms.gov" },
  { title: "levoit core 300 air purifier manual", url: "https://ww2.jacksonrms.gov/y/levoit.pdf", host: "ww2.jacksonrms.gov" },
  { title: "Levoit Core 300 Air Purifier manual", url: "https://publicreg.vaccination.gov.ng/z/levoit.pdf", host: "publicreg.vaccination.gov.ng" },
]

describe("the reported search", () => {
  it("offers the manufacturer CDN and refuses the three government hosts", () => {
    const kept = live.filter((c) => isOfferableManual(c, "Levoit", "Core 300"))
    expect(kept.map((c) => c.host)).toEqual(["files.vesync.com"])
  })
})

describe("isInstitutionalHost", () => {
  it("covers plain and country-coded institutional suffixes", () => {
    for (const h of ["jfd.jacksonrms.gov", "publicreg.vaccination.gov.ng", "army.mil", "cs.stanford.edu", "dept.ac.uk"]) {
      expect(isInstitutionalHost(h), h).toBe(true)
    }
  })

  it("does not catch ordinary commercial hosts", () => {
    // "gov" and "edu" inside a label are not suffixes — govee.com is a real
    // appliance brand, and rejecting it would be the same class of mistake.
    for (const h of ["files.vesync.com", "govee.com", "lg.com", "manualslib.com", "education.co"]) {
      expect(isInstitutionalHost(h), h).toBe(false)
    }
  })
})

describe("namesProduct", () => {
  it("accepts a brand match even when the title is only a model code", () => {
    expect(namesProduct("WM4000HWA.pdf", "https://lg.com/WM4000HWA.pdf", "LG", "WM4000HWA")).toBe(true)
  })

  it("accepts a model match on a parent company's CDN", () => {
    // Levoit manuals live on vesync.com — the brand appears nowhere in the host.
    expect(namesProduct("Core 300S user manual", "https://files.vesync.com/a.pdf", "Levoit", "Core 300")).toBe(true)
  })

  it("rejects a PDF that names neither — a filename is not evidence", () => {
    expect(namesProduct("Owner's Manual", "https://cdn.example.com/docs/8812.pdf", "Levoit", "Core 300")).toBe(false)
  })

  it("ignores punctuation and case differences in the model", () => {
    expect(namesProduct("core-300 guide", "https://x.com/a.pdf", "Levoit", "Core 300")).toBe(true)
  })
})
