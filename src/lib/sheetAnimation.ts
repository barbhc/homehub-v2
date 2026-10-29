import { spring } from "motion/react"
import { SPRING_SHEET } from "@/lib/motion"

/**
 * Two tiny frame drivers for the bottom sheet: a spring (Motion's own spring
 * physics, the same generator `animate()` uses) and a linear tween. Driving
 * them here rather than through Motion's `animate()` keeps the sheet's chunk
 * small — `animate()` brings Motion's whole DOM animation engine, and the
 * sheet only ever animates one number at a time and writes it itself.
 *
 * Each returns a handle whose stop() cancels the next frame, so any animation
 * can be grabbed mid-flight.
 */
export interface FrameAnimation { stop(): void }

/** Spring `from` → `to` on SPRING_SHEET, starting at `velocity` px/s. */
export function springTo(
  from: number,
  to: number,
  velocity: number,
  onUpdate: (v: number) => void,
  onComplete?: () => void,
): FrameAnimation {
  const gen = spring({
    keyframes: [from, to],
    velocity,
    stiffness: SPRING_SHEET.stiffness,
    damping: SPRING_SHEET.damping,
    mass: SPRING_SHEET.mass,
  })
  return drive((elapsed) => {
    const { value, done } = gen.next(elapsed)
    onUpdate(done ? to : value)
    return done
  }, onComplete)
}

/** Linear tween `from` → `to` over `seconds`. */
export function tweenTo(
  from: number,
  to: number,
  seconds: number,
  onUpdate: (v: number) => void,
  onComplete?: () => void,
): FrameAnimation {
  const ms = Math.max(1, seconds * 1000)
  return drive((elapsed) => {
    const t = Math.min(1, elapsed / ms)
    onUpdate(from + (to - from) * t)
    return t >= 1
  }, onComplete)
}

function drive(step: (elapsedMs: number) => boolean, onComplete?: () => void): FrameAnimation {
  let start: number | null = null
  let id = requestAnimationFrame(function frame(now) {
    if (start === null) start = now
    if (step(now - start)) onComplete?.()
    else id = requestAnimationFrame(frame)
  })
  return { stop: () => cancelAnimationFrame(id) }
}
