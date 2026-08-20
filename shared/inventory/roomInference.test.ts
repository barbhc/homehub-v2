/**
 * HH-23: prefill the room when it's a fact, ask when it isn't.
 *
 * The interesting assertions here are the NEGATIVE ones. Anyone extending the
 * map later will be tempted to "improve coverage"; these say why not.
 */
import { describe, expect, it } from "vitest"
import { inferRoom, roomIsAmbiguous, SEEDED_ROOMS } from "./roomInference"

describe("inferRoom", () => {
  it("places appliances defined by where they're plumbed or vented", () => {
    expect(inferRoom("dishwasher")).toBe("Kitchen")
    expect(inferRoom("range-hood")).toBe("Kitchen")
    expect(inferRoom("washing-machine")).toBe("Laundry Room")
    expect(inferRoom("water-heater")).toBe("Utility Room")
    expect(inferRoom("gutters")).toBe("Outdoor/Yard")
  })

  it("refuses to place the owner's own example", () => {
    // "an air filter could be in any room" — the instruction this was built to.
    expect(inferRoom("air-purifier")).toBeNull()
    expect(roomIsAmbiguous("air-purifier")).toBe(true)
  })

  it("refuses anything you can picture in a second room without straining", () => {
    for (const s of ["television", "sofa", "vacuum", "ceiling-fan", "humidifier", "mattress"]) {
      expect(inferRoom(s), s).toBeNull()
    }
  })

  it("refuses a faucet, which is the ambiguity in miniature", () => {
    // Kitchen or bathroom, with nothing in the subtype to separate them.
    expect(inferRoom("faucet")).toBeNull()
  })

  it("says nothing when it knows nothing", () => {
    expect(inferRoom(null)).toBeNull()
    expect(inferRoom(undefined)).toBeNull()
    expect(inferRoom("")).toBeNull()
    expect(inferRoom("subtype-invented-next-year")).toBeNull()
  })

  it("never suggests a room the home does not have", () => {
    // Suggesting a missing room is worse than staying quiet: the user has to
    // notice it and undo it.
    const noLaundry = ["Kitchen", "Bathroom", "Garage"]
    expect(inferRoom("washing-machine", noLaundry)).toBeNull()
    expect(inferRoom("dishwasher", noLaundry)).toBe("Kitchen")
  })

  it("matches the home's rooms case-insensitively", () => {
    expect(inferRoom("dishwasher", ["kitchen"])).toBe("Kitchen")
  })

  it("only ever names a room every home is seeded with", () => {
    const subtypes = ["dishwasher", "dryer", "toilet", "chainsaw", "roof", "hvac-furnace", "grill"]
    for (const s of subtypes) {
      const r = inferRoom(s)
      expect(SEEDED_ROOMS, s).toContain(r)
    }
  })
})
