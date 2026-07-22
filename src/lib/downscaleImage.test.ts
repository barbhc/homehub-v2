import { describe, it, expect } from "vitest"
import { fitWithin } from "./downscaleImage"

// The canvas/createImageBitmap half runs in real browsers only (exercised by
// the smart-add e2e spec); the sizing math is the fixture-testable core.
describe("fitWithin", () => {
  it("leaves images already inside the box untouched", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it("scales landscape by the long edge, preserving aspect", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it("scales portrait by the long edge, preserving aspect", () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it("never returns a zero dimension for extreme aspect ratios", () => {
    const r = fitWithin(10_000, 1, 1600)
    expect(r.width).toBe(1600)
    expect(r.height).toBeGreaterThanOrEqual(1)
  })
})
