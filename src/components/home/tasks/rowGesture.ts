// ── Task-row gestures: the swipe's physics as pure functions ─────────────────
// Apple polish phase 2 (motion), the approved demo's numbers
// (https://claude.ai/artifact/1DwQLYdx2ewMk3RoYrxp8t). Kept free of React and
// the DOM so the commit decision — the part a person feels as "it counted" or
// "it didn't" — is pinned by unit tests (rowGesture.test.ts).

import { FLICK_MIN_DISTANCE, FLICK_VELOCITY } from "@/lib/motion"

export const SWIPE = {
  /** Travel (px) before the gesture picks an axis — vertical scrolling wins below it. */
  axisLock: 8,
  /** Past this fraction of the row's width the row resists the finger… */
  resistFrom: 0.6,
  /** …moving this much per pixel of finger travel. */
  resistance: 0.35,
  /** Released past this fraction of the width, the swipe commits. */
  commitAt: 0.3,
  /** Velocity is read over the last this-many ms before release. */
  velocityWindowMs: 100,
} as const

export const PRESS = {
  /** The tint waits this long (ms) after a finger lands, so a scroll never flashes every row it crosses. */
  delayMs: 40,
  /** A finger that travels farther than this (px) is scrolling or swiping, not pressing. */
  slop: 6,
} as const

export type SwipeAction = "done" | "snooze"

/** Where the row sits for a finger `dx` from where it started: 1:1, then resisting past 60% of the width. */
export function resist(dx: number, width: number): number {
  const lim = width * SWIPE.resistFrom
  const a = Math.abs(dx)
  if (width <= 0 || a <= lim) return dx
  return Math.sign(dx) * (lim + (a - lim) * SWIPE.resistance)
}

/** Far enough that letting go now commits — the moment the icon grows. */
export function isArmed(offset: number, width: number): boolean {
  return width > 0 && Math.abs(offset) >= width * SWIPE.commitAt
}

/**
 * What a release does. Right is Done, left is Snooze. It commits when the row
 * is past 30% of its width, OR when it was flicked faster than FLICK_VELOCITY
 * in the direction it is already travelling with more than FLICK_MIN_DISTANCE (16px) behind it — a
 * short quick flick counts, a flick back toward rest does not.
 */
export function swipeDecision({ offset, velocity, width }: { offset: number; velocity: number; width: number }): SwipeAction | null {
  if (offset === 0) return null
  const dir = Math.sign(offset)
  const far = isArmed(offset, width)
  const flick =
    Math.abs(velocity) > FLICK_VELOCITY && Math.sign(velocity) === dir && Math.abs(offset) > FLICK_MIN_DISTANCE
  if (!far && !flick) return null
  return dir > 0 ? "done" : "snooze"
}

export type Sample = { t: number; x: number }

/**
 * The finger's speed at release, px/s, over the last SWIPE.velocityWindowMs.
 * The release itself is the last sample, so a finger that stopped before
 * lifting reads as (nearly) still — a slow drag never becomes a flick.
 */
export function releaseVelocity(samples: Sample[]): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  const recent = samples.filter((s) => s.t >= last.t - SWIPE.velocityWindowMs)
  const first = recent[0]
  const dt = last.t - first.t
  if (recent.length < 2 || dt <= 0) return 0
  return ((last.x - first.x) / dt) * 1000
}
