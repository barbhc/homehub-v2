/**
 * A tiny spring/tween driver for one number, on requestAnimationFrame.
 *
 * Pull to refresh lives in Home's chunk, which is on the cold-start path, and
 * Motion's `animate()` would add ~25 KB gzipped to that path for two easings.
 * This integrates the SAME spring tokens (src/lib/motion.ts SPRING_SHEET:
 * stiffness, damping, mass) in a few lines, so the feel is the token's and
 * the boot budget is untouched. Components that need Motion's full engine
 * (sheets, swipe rows) still use Motion.
 */
export type SpringParams = { stiffness: number; damping: number; mass: number }

/** Settled when this close to the target and this slow (px, px/s). */
const REST_DELTA = 0.5
const REST_SPEED = 5
/** Integration step (s): small enough to stay stable at the app's stiffest spring. */
const STEP = 1 / 240

/**
 * One frame of a damped spring, from `x` moving at `v` toward `to`, over `dt`
 * seconds. Pure (unit-tested); semi-implicit Euler in fixed sub-steps.
 */
export function stepSpring(x: number, v: number, to: number, dt: number, p: SpringParams): { x: number; v: number; done: boolean } {
  let t = 0
  while (t < dt) {
    const h = Math.min(STEP, dt - t)
    const force = -p.stiffness * (x - to) - p.damping * v
    v += (force / p.mass) * h
    x += v * h
    t += h
  }
  const done = Math.abs(x - to) < REST_DELTA && Math.abs(v) < REST_SPEED
  return done ? { x: to, v: 0, done } : { x, v, done }
}

/** Animate `from` → `to` on a spring; returns a stop function. Calls onUpdate every frame, ending exactly on `to`. */
export function springTo(from: number, to: number, p: SpringParams, onUpdate: (x: number) => void): () => void {
  let x = from
  let v = 0
  let last: number | null = null
  let raf = 0
  const frame = (now: number) => {
    // Cap a frame at 64ms: a backgrounded tab resuming must not leap.
    const dt = last === null ? 1 / 60 : Math.min(0.064, (now - last) / 1000)
    last = now
    const next = stepSpring(x, v, to, dt, p)
    x = next.x
    v = next.v
    onUpdate(x)
    if (!next.done) raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

/** Animate `from` → `to` linearly over `seconds` (Reduce Motion's fades); returns a stop function. */
export function tweenTo(from: number, to: number, seconds: number, onUpdate: (x: number) => void): () => void {
  let start: number | null = null
  let raf = 0
  const frame = (now: number) => {
    if (start === null) start = now
    const k = seconds > 0 ? Math.min(1, (now - start) / (seconds * 1000)) : 1
    onUpdate(from + (to - from) * k)
    if (k < 1) raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}
