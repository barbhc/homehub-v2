import { describe, expect, it } from "vitest"
import { stepSpring } from "./spring"
import { SPRING_SHEET } from "./motion"

/** Run the spring frame by frame at 60fps until it settles. */
function settle(from: number, to: number) {
  let x = from, v = 0, frames = 0, min = Infinity, max = -Infinity
  for (; frames < 600; frames++) {
    const s = stepSpring(x, v, to, 1 / 60, SPRING_SHEET)
    x = s.x; v = s.v
    min = Math.min(min, x); max = Math.max(max, x)
    if (s.done) break
  }
  return { x, frames, min, max }
}

describe("spring (SPRING_SHEET tokens)", () => {
  it("springs back to rest from a pull, ending exactly on the target", () => {
    const r = settle(60, 0)
    expect(r.x).toBe(0)
    // Brief, like the token: settles in well under a second.
    expect(r.frames).toBeLessThan(40)
    // Lightly damped at most: no big overshoot past rest.
    expect(r.min).toBeGreaterThan(-3)
  })

  it("rises to the refresh hold and stops there", () => {
    const r = settle(80, 52)
    expect(r.x).toBe(52)
    expect(r.frames).toBeLessThan(40)
  })

  it("is stable on a long frame (a resumed tab)", () => {
    const s = stepSpring(60, 0, 0, 0.064, SPRING_SHEET)
    expect(Number.isFinite(s.x)).toBe(true)
    expect(Math.abs(s.x)).toBeLessThan(60)
  })
})
