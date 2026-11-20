/**
 * Pull to refresh — the gesture's decision (src/lib/pullToRefresh.ts).
 *
 * What these pin, from the Phase 2 motion plan: a pull only starts at the very
 * top; release past ~64px refreshes exactly once; short of it springs back with
 * no refresh; it never fights a scroll or a sideways swipe; nothing starts
 * while a refresh runs; a cancelled touch never refreshes.
 */
import { describe, expect, it } from "vitest"
import { IDLE, PULL_HOLD, PULL_MAX, PULL_THRESHOLD, ownsGesture, pullProgress, resist, stepPull, type PullEvent, type PullState } from "./pullToRefresh"

/** Run a sequence of events; count the refreshes it starts. */
function run(events: PullEvent[], from: PullState = IDLE) {
  let state = from
  let refreshes = 0
  const owned: boolean[] = []
  for (const e of events) {
    const next = stepPull(state, e)
    state = next.state
    if (next.refresh) refreshes++
    if (e.type === "move") owned.push(ownsGesture(state))
  }
  return { state, refreshes, owned }
}

/** A straight vertical drag of `dy` px from y=100, landing at the top or not. */
function drag(dy: number, { atTop = true, dx = 0, steps = 4 } = {}): PullEvent[] {
  const evs: PullEvent[] = [{ type: "start", x: 200, y: 100, atTop }]
  for (let i = 1; i <= steps; i++) evs.push({ type: "move", x: 200 + (dx * i) / steps, y: 100 + (dy * i) / steps })
  evs.push({ type: "end" })
  return evs
}

describe("pull to refresh · the decision", () => {
  it("an 80px pull from the top refreshes exactly once", () => {
    const r = run(drag(80))
    expect(r.refreshes).toBe(1)
    expect(r.state.kind).toBe("refreshing")
  })

  it("a 30px pull springs back with no refresh", () => {
    const r = run(drag(30))
    expect(r.refreshes).toBe(0)
    expect(r.state).toEqual(IDLE)
  })

  it("the threshold is the finger's travel: just short does nothing, exactly at it refreshes", () => {
    expect(run(drag(PULL_THRESHOLD - 1)).refreshes).toBe(0)
    expect(run(drag(PULL_THRESHOLD)).refreshes).toBe(1)
  })

  it("pulling past and coming back short before letting go does not refresh", () => {
    const r = run([
      { type: "start", x: 0, y: 100, atTop: true },
      { type: "move", x: 0, y: 200 },
      { type: "move", x: 0, y: 120 },
      { type: "end" },
    ])
    expect(r.refreshes).toBe(0)
  })

  it("a touch that lands while the page is scrolled is a scroll — never looked at again", () => {
    const r = run(drag(200, { atTop: false }))
    expect(r.refreshes).toBe(0)
    expect(r.owned.every((o) => !o)).toBe(true)
  })

  it("an upward first move is a scroll: handed back at once and for good", () => {
    const r = run([
      { type: "start", x: 0, y: 300, atTop: true },
      { type: "move", x: 0, y: 290 },
      // Even if it then comes back down past the threshold.
      { type: "move", x: 0, y: 400 },
      { type: "end" },
    ])
    expect(r.refreshes).toBe(0)
    expect(r.owned).toEqual([false, false])
  })

  it("a sideways first move is a row swipe, not a pull", () => {
    const r = run(drag(80, { dx: 160 }))
    expect(r.refreshes).toBe(0)
    expect(r.owned.every((o) => !o)).toBe(true)
  })

  it("owns the gesture from the FIRST downward move — before iOS can start its own bounce", () => {
    const r = run([
      { type: "start", x: 0, y: 100, atTop: true },
      { type: "move", x: 0, y: 101 },
    ])
    expect(r.owned).toEqual([true])
  })

  it("nothing starts while a refresh runs; only its settling ends it", () => {
    const during = run(drag(120), { kind: "refreshing" })
    expect(during.refreshes).toBe(0)
    expect(during.state.kind).toBe("refreshing")
    expect(during.owned.every((o) => !o)).toBe(true)
    expect(stepPull({ kind: "refreshing" }, { type: "done" }).state).toEqual(IDLE)
  })

  it("a cancelled touch (the system took it) never refreshes", () => {
    const r = run([
      { type: "start", x: 0, y: 100, atTop: true },
      { type: "move", x: 0, y: 220 },
      { type: "cancel" },
      { type: "end" },
    ])
    expect(r.refreshes).toBe(0)
    expect(r.state).toEqual(IDLE)
  })

  it("after a refresh settles, the next pull works again", () => {
    const first = run(drag(90))
    const settled = stepPull(first.state, { type: "done" }).state
    expect(run(drag(90), settled).refreshes).toBe(1)
  })
})

describe("pull to refresh · resistance", () => {
  it("follows the finger at first, then stiffens, and never passes PULL_MAX", () => {
    expect(resist(0)).toBe(0)
    expect(resist(-20)).toBe(0)
    expect(resist(10)).toBeGreaterThan(9)
    expect(resist(10)).toBeLessThan(10)
    // Each extra 40px of finger buys less page than the last.
    const a = resist(40), b = resist(80), c = resist(120)
    expect(b - a).toBeLessThan(a)
    expect(c - b).toBeLessThan(b - a)
    expect(resist(10_000)).toBeLessThanOrEqual(PULL_MAX)
  })

  it("the hold sits within reach of an armed pull, so letting go doesn't jump the page down", () => {
    expect(PULL_HOLD).toBeLessThanOrEqual(resist(PULL_THRESHOLD) + 4)
  })

  it("progress runs 0 → 1 across the threshold and stays there", () => {
    expect(pullProgress(0)).toBe(0)
    expect(pullProgress(PULL_THRESHOLD / 2)).toBeCloseTo(0.5)
    expect(pullProgress(PULL_THRESHOLD * 3)).toBe(1)
  })
})
