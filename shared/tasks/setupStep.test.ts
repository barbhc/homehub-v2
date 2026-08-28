import { describe, it, expect } from "vitest"
import { looksLikeSetupStep } from "./houseRules"

describe("looksLikeSetupStep", () => {
  it("catches the one the owner reported", () => {
    expect(looksLikeSetupStep("Purge Hot Water Lines Before First Use")).toBe(true)
  })

  it("catches the other ways a manual says the same thing", () => {
    for (const t of [
      "Run an empty cycle prior to first use",
      "Initial setup of the water filter",
      "Level the appliance at installation",
      "Remove shipping bolts when installing",
    ]) expect(looksLikeSetupStep(t), t).toBe(true)
  })

  it("does NOT swallow recurring work that mentions use", () => {
    // These are the strings a looser pattern would eat, turning a monthly job
    // into a one-time step that never comes back.
    for (const t of [
      "Clean the filter after each use",
      "Rinse the basket before every wash",
      "Wipe the door seal after every cycle",
      "Descale every 3 months",
    ]) expect(looksLikeSetupStep(t), t).toBe(false)
  })

  it("leaves ordinary maintenance alone", () => {
    for (const t of ["Clean the Filter System", "Inspect and Clean Spray Arms", "Winterize the Dishwasher"]) {
      expect(looksLikeSetupStep(t), t).toBe(false)
    }
  })
})
