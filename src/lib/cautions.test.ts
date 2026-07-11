import { describe, it, expect } from "vitest"
import { splitCautions } from "./cautions"

describe("splitCautions", () => {
  it("pulls a 'do not' warning out of the steps (the steel-wool case)", () => {
    const { steps, cautions } = splitCautions([
      "Remove the burner caps.",
      "Soak them in warm soapy water.",
      "Do NOT use steel wool.",
    ])
    expect(steps).toEqual(["Remove the burner caps.", "Soak them in warm soapy water."])
    expect(cautions).toEqual(["Do NOT use steel wool."])
  })

  it("detects never / avoid / caution / warning", () => {
    const { cautions } = splitCautions([
      "Never run the disposal without water.",
      "Avoid abrasive pads.",
      "Warning: surface is hot.",
    ])
    expect(cautions).toContain("Never run the disposal without water.")
    expect(cautions).toContain("Avoid abrasive pads.")
    // "Warning:" prefix is stripped
    expect(cautions).toContain("surface is hot.")
  })

  it("unions structured cautions with heuristic ones and de-dupes", () => {
    const { cautions } = splitCautions(["Do not overfill."], ["Do not overfill.", "Unplug first."])
    expect([...cautions].sort()).toEqual(["Do not overfill.", "Unplug first."])
  })

  it("keeps ordinary steps as steps", () => {
    const { steps, cautions } = splitCautions(["Press and hold for 3 seconds."])
    expect(steps).toEqual(["Press and hold for 3 seconds."])
    expect(cautions).toEqual([])
  })

  it("keeps a warning embedded inside an action as a step (not the callout)", () => {
    const { steps, cautions } = splitCautions([
      "Wash heads with a plastic brush (never steel wool).",
    ])
    expect(steps).toEqual(["Wash heads with a plastic brush (never steel wool)."])
    expect(cautions).toEqual([])
  })
})
