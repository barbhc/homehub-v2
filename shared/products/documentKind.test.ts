/**
 * HH-73 — the LG dryer search offered a spec sheet wearing the trust badge.
 */
import { describe, expect, it } from "vitest"
import { documentKind, displayTitle } from "./documentKind"

describe("documentKind", () => {
  it("catches the exact document that started this", () => {
    const r = documentKind("DLEX3900-DLGX3901-Spec-Sheet.pdf", "https://lg.com/…")
    expect(r.kind).toBe("spec")
    expect(r.label).toBe("Spec sheet")
    // The reason it matters: a spec sheet parses into confident nonsense.
    expect(r.thinOnUpkeep).toBe(true)
  })

  it("says nothing about an ordinary manual", () => {
    for (const t of ["LG DLGX3901B Owner's Manual", "user manual", "Use and Care Guide"]) {
      const r = documentKind(t)
      expect(r.label, t).toBeNull()
      expect(r.kind, t).toBe("manual")
    }
  })

  it("lets an explicit owner's-manual claim outrank a stray word", () => {
    // A single file can be both; the manual claim is the stronger signal.
    expect(documentKind("Owner's Manual and Warranty").kind).toBe("manual")
    expect(documentKind("Owner's Manual — installation instructions").kind).toBe("manual")
  })

  it("labels the others without calling them thin", () => {
    expect(documentKind("Quick Start Guide").label).toBe("Quick start")
    expect(documentKind("Quick Start Guide").thinOnUpkeep).toBe(false)
    expect(documentKind("Parts List").thinOnUpkeep).toBe(true)
  })

  it("reads the URL when the title says nothing", () => {
    expect(documentKind("", "https://x.com/files/WM4000-spec-sheet.pdf").kind).toBe("spec")
  })
})

describe("displayTitle", () => {
  it("replaces a title that is only the host name", () => {
    // The reported case: partstown.com came back titled "Partstown".
    const out = displayTitle("Partstown", "https://partstown.com/lg/DLGX3901B-parts.pdf", "partstown.com")
    expect(out).not.toBe("Partstown")
    expect(out).toContain("DLGX3901B")
  })

  it("keeps a title that actually describes the document", () => {
    expect(displayTitle("LG Owner's Manual", "https://lg.com/a.pdf", "lg.com")).toBe("LG Owner's Manual")
  })

  it("falls back to the host when there is nothing else at all", () => {
    expect(displayTitle("", "not a url", "example.com")).toBe("example.com")
  })
})
