import { describe, it, expect } from "vitest"
import { groundInText } from "./groundExtraction"

const ext = (over: Partial<{ brand: string | null; model: string | null; name: string | null }> = {}) => ({
  brand: null as string | null, model: null as string | null, name: null as string | null, ...over,
})

/** The label the owner actually scanned: model printed as text, brand as a logo
 *  Vision could not transcribe. */
const LG_DRYER_OCR = `
  MODEL NO. WM3900HBA
  120V 60Hz 10A
  SERIAL 902KWXY01234
  MADE IN KOREA
`

describe("groundInText", () => {
  it("drops the brand the extractor invented", () => {
    // The reported bug, exactly: right model, hallucinated brand.
    const out = groundInText(ext({ brand: "Whirlpool", model: "WM3900HBA", name: "Whirlpool WM3900HBA" }), LG_DRYER_OCR)
    expect(out.brand).toBeNull()
    expect(out.model).toBe("WM3900HBA")
  })

  it("drops the composed name along with the brand that made it", () => {
    // Otherwise "Whirlpool WM3900HBA" survives as the item's name after the
    // brand it came from has been removed.
    const out = groundInText(ext({ brand: "Whirlpool", model: "WM3900HBA", name: "Whirlpool WM3900HBA" }), LG_DRYER_OCR)
    expect(out.name).toBeNull()
  })

  it("keeps a brand that IS on the label", () => {
    const out = groundInText(ext({ brand: "LG", model: "WM3900HBA", name: "LG WM3900HBA" }), `LG ${LG_DRYER_OCR}`)
    expect(out).toEqual({ brand: "LG", model: "WM3900HBA", name: "LG WM3900HBA" })
  })

  it("survives punctuation and spacing drift in the model", () => {
    // The label prints "WM-3900 HBA"; the extractor normalises it. That is a
    // formatting difference, not an invention, and must not be discarded.
    const out = groundInText(ext({ model: "WM3900HBA" }), "MODEL NO. WM-3900 HBA")
    expect(out.model).toBe("WM3900HBA")
  })

  it("is case-insensitive about the brand", () => {
    const out = groundInText(ext({ brand: "Bosch", model: "SHPM65Z55N" }), "bosch shpm65z55n dishwasher")
    expect(out.brand).toBe("Bosch")
  })

  it("drops a model that is not in the text either", () => {
    // Not just a brand problem — the same rule protects the model.
    const out = groundInText(ext({ brand: "LG", model: "DLEX4000B" }), "LG WM3900HBA")
    expect(out.model).toBeNull()
    expect(out.brand).toBe("LG")
  })

  it("leaves everything null when nothing was read", () => {
    expect(groundInText(ext({ brand: "GE", model: "ABC" }), "")).toEqual({ brand: null, model: null, name: null })
  })
})
