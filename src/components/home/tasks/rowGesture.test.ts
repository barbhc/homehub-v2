import { describe, expect, it } from "vitest"
import { FLICK_MIN_DISTANCE, FLICK_VELOCITY } from "@/lib/motion"
import { isArmed, releaseVelocity, resist, swipeDecision } from "./rowGesture"

// The approved demo's swipe (Apple polish phase 2): commit past 30% of the
// row's width, or on a flick faster than FLICK_VELOCITY in the direction of
// travel with more than FLICK_MIN_DISTANCE behind it. Right is Done, left Snooze.
const W = 350

describe("swipeDecision — distance", () => {
  it("commits past 30% of the width, in either direction", () => {
    expect(swipeDecision({ offset: 0.3 * W, velocity: 0, width: W })).toBe("done")
    expect(swipeDecision({ offset: -0.3 * W, velocity: 0, width: W })).toBe("snooze")
    expect(swipeDecision({ offset: 0.4 * W, velocity: 0, width: W })).toBe("done")
  })
  it("a slow drag short of 30% snaps back", () => {
    expect(swipeDecision({ offset: 60, velocity: 120, width: W })).toBeNull()
    expect(swipeDecision({ offset: -0.29 * W, velocity: -200, width: W })).toBeNull()
  })
  it("no offset, no action", () => {
    expect(swipeDecision({ offset: 0, velocity: 2000, width: W })).toBeNull()
  })
})

describe("swipeDecision — velocity", () => {
  it("a fast short flick commits", () => {
    expect(swipeDecision({ offset: 60, velocity: FLICK_VELOCITY + 1, width: W })).toBe("done")
    expect(swipeDecision({ offset: -60, velocity: -(FLICK_VELOCITY + 1), width: W })).toBe("snooze")
  })
  it("at exactly FLICK_VELOCITY it does not (faster than, not as fast as)", () => {
    expect(swipeDecision({ offset: 60, velocity: FLICK_VELOCITY, width: W })).toBeNull()
  })
  it("a flick back toward rest does not commit", () => {
    expect(swipeDecision({ offset: 60, velocity: -3000, width: W })).toBeNull()
    expect(swipeDecision({ offset: -60, velocity: 3000, width: W })).toBeNull()
  })
  it("a fast jitter under FLICK_MIN_DISTANCE does not commit", () => {
    expect(swipeDecision({ offset: FLICK_MIN_DISTANCE, velocity: 4000, width: W })).toBeNull()
    expect(swipeDecision({ offset: FLICK_MIN_DISTANCE + 1, velocity: 4000, width: W })).toBe("done")
  })
})

describe("resist / isArmed", () => {
  it("follows the finger 1:1 up to 60% of the width, then at 0.35", () => {
    expect(resist(100, W)).toBe(100)
    expect(resist(0.6 * W, W)).toBeCloseTo(0.6 * W)
    expect(resist(0.6 * W + 100, W)).toBeCloseTo(0.6 * W + 35)
    expect(resist(-(0.6 * W + 100), W)).toBeCloseTo(-(0.6 * W + 35))
  })
  it("arms at the commit distance", () => {
    expect(isArmed(0.29 * W, W)).toBe(false)
    expect(isArmed(-0.3 * W, W)).toBe(true)
    expect(isArmed(100, 0)).toBe(false)
  })
})

describe("releaseVelocity", () => {
  it("reads px/s over the last 100ms", () => {
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 50, x: 30 }, { t: 100, x: 60 }])).toBeCloseTo(600)
  })
  it("a finger that stopped before lifting reads as still", () => {
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 40, x: 60 }, { t: 400, x: 60 }])).toBe(0)
  })
  it("one sample is no speed", () => {
    expect(releaseVelocity([{ t: 0, x: 0 }])).toBe(0)
  })
})
