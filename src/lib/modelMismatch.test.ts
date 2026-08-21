/**
 * The Core 300S case (beta round 5, 23:18).
 *
 * The owner was offered a "Levoit Core 300S user manual" for her Core 300 and
 * had no way to tell. It would have parsed cleanly and produced confident tasks
 * for the smart variant.
 */
import { describe, it, expect } from "vitest"
import { findModelMismatch } from "../../shared/products/modelMismatch"

describe("findModelMismatch", () => {
  it("catches the reported case", () => {
    expect(findModelMismatch("Levoit Core 300S user manual", "Core 300")).toBe("Core 300S")
  })

  it("stays silent when the title names exactly what was typed", () => {
    expect(findModelMismatch("Levoit Core 300 True HEPA Air Purifier", "Core 300")).toBeNull()
    expect(findModelMismatch("LEVOIT Core300 manual", "Core 300")).toBeNull()
    expect(findModelMismatch("Levoit Core-300 manual", "Core 300")).toBeNull()
  })

  it("catches variant suffixes on joined model codes", () => {
    expect(findModelMismatch("LG WM4000HWAX service manual", "WM4000HWA")).toBe("WM4000HWAX")
  })

  it("does not cry mismatch over an unrelated token that shares a prefix", () => {
    // Long extensions are different words, not variant suffixes.
    expect(findModelMismatch("Core 300 Installation Considerations", "Core 300")).toBeNull()
    expect(findModelMismatch("Levoit Vital 100S manual", "Core 300")).toBeNull()
  })

  it("says nothing when there is no model to reason about", () => {
    expect(findModelMismatch("Owner's manual", "Core 300")).toBeNull()
    expect(findModelMismatch("Levoit Core 300S manual", "")).toBeNull()
    expect(findModelMismatch("Levoit Core 300S manual", "ab")).toBeNull()
  })

  it("reports the model as the title wrote it, so it matches the label", () => {
    // Recognisable against the nameplate, not normalised into shouting.
    expect(findModelMismatch("Levoit Core 300s user manual", "Core 300")).toBe("Core 300s")
  })
})

describe("HH-73 — a document naming other models, none of them yours", () => {
  it("flags the LG spec sheet that started this", () => {
    // Offered for a DLGX3901B. Names a sibling (DLEX3900) and a truncation
    // (DLGX3901); the old extension-only search returned null for both, so it
    // arrived with no warning at all.
    expect(findModelMismatch("DLEX3900-DLGX3901-Spec-Sheet.pdf", "DLGX3901B")).toBe("DLGX3901")
  })

  it("still catches the longer-variant case it was built for", () => {
    expect(findModelMismatch("Levoit Core 300S user manual", "Core 300")).toBe("Core 300S")
  })

  it("stays silent when the title names your model exactly", () => {
    expect(findModelMismatch("LG DLGX3901B Owner Manual", "DLGX3901B")).toBeNull()
  })

  it("does not invent a mismatch out of an unrelated number", () => {
    // The guard has to be quiet by default or the warning stops meaning
    // anything — a year in a filename is not a model.
    expect(findModelMismatch("Owner manual 2024 edition", "DLGX3901B")).toBeNull()
    expect(findModelMismatch("Partstown", "DLGX3901B")).toBeNull()
    expect(findModelMismatch("Manual rev 12", "DLGX3901B")).toBeNull()
  })
})
