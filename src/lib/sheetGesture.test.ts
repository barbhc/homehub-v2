import { describe, expect, it } from "vitest"
import {
  DISMISS_FRACTION, RUBBER_BAND, SHEET_FLICK_VELOCITY as FLICK_VELOCITY, dismissDecision, releaseDecision, releaseVelocity, rubberBand, scrimFor,
} from "./sheetGesture"

const H = 500

describe("rubberBand", () => {
  it("follows the finger 1:1 downward", () => {
    expect(rubberBand(0)).toBe(0)
    expect(rubberBand(120)).toBe(120)
  })
  it("resists upward at a fifth of the finger's travel", () => {
    expect(RUBBER_BAND).toBe(0.2)
    expect(rubberBand(-100)).toBeCloseTo(-20)
  })
})

describe("releaseVelocity", () => {
  it("is distance over time across the recent samples, in px/s", () => {
    expect(releaseVelocity([[1000, 100], [1050, 150], [1100, 200]], 1100)).toBeCloseTo(1000)
  })
  it("is negative for an upward flick", () => {
    expect(releaseVelocity([[0, 300], [50, 250]], 50)).toBeCloseTo(-1000)
  })
  it("ignores samples older than 100 ms before release", () => {
    // Fast early, then the finger held still for 150 ms before lifting.
    expect(releaseVelocity([[0, 0], [20, 200], [40, 400]], 190)).toBe(0)
  })
  it("is 0 with fewer than two samples", () => {
    expect(releaseVelocity([], 0)).toBe(0)
    expect(releaseVelocity([[10, 10]], 10)).toBe(0)
  })
})

describe("releaseDecision", () => {
  const at = (offset: number, velocity = 0, dirty = false) => releaseDecision({ offset, height: H, velocity, dirty })

  it("closes past 30% of the sheet's height", () => {
    expect(DISMISS_FRACTION).toBe(0.3)
    expect(at(H * 0.4)).toBe("dismiss")
    expect(at(H * 0.31)).toBe("dismiss")
  })
  it("springs back short of 30% when released slowly", () => {
    expect(at(H * 0.1)).toBe("settle")
    expect(at(H * 0.3)).toBe("settle")
    expect(at(H * 0.29, FLICK_VELOCITY - 1)).toBe("settle")
  })
  it("closes on a quick downward flick (over ~600 px/s) even short of 30%", () => {
    expect(FLICK_VELOCITY).toBe(600)
    expect(at(H * 0.15, FLICK_VELOCITY + 1)).toBe("dismiss")
    expect(at(10, 2000)).toBe("dismiss")
  })
  it("never closes on an upward flick", () => {
    expect(at(-20, -3000)).toBe("settle")
  })
  it("asks before closing a sheet with unsaved input — by distance or by flick", () => {
    expect(at(H * 0.4, 0, true)).toBe("confirm-discard")
    expect(at(H * 0.15, 2000, true)).toBe("confirm-discard")
  })
  it("a dirty sheet that was not meant to close just springs back, no prompt", () => {
    expect(at(H * 0.1, 0, true)).toBe("settle")
  })
})

describe("dismissDecision (scrim, Escape, close button)", () => {
  it("closes a clean sheet", () => expect(dismissDecision(false)).toBe("dismiss"))
  it("asks first when dirty", () => expect(dismissDecision(true)).toBe("confirm-discard"))
})

describe("scrimFor", () => {
  it("is fully dim at rest and clear when the sheet is all the way down", () => {
    expect(scrimFor(0, H)).toBe(1)
    expect(scrimFor(H, H)).toBe(0)
    expect(scrimFor(H / 2, H)).toBeCloseTo(0.5)
  })
  it("clamps: no brighter than 1 while rubber-banding up, no negative past the bottom", () => {
    expect(scrimFor(-30, H)).toBe(1)
    expect(scrimFor(H + 40, H)).toBe(0)
  })
})
