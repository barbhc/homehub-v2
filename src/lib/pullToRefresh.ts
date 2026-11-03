/**
 * Pull to refresh — the decision, kept pure so it can be pinned by unit tests
 * (src/lib/pullToRefresh.test.ts). The component that feeds it touch events
 * and draws the spinner is src/components/layout/PullToRefresh.tsx.
 *
 * The rules, each one a way the gesture could go wrong on a phone:
 *  · It only starts from rest AT THE TOP. A finger that lands while the page is
 *    scrolled down is a scroll, and is never looked at again.
 *  · The FIRST move decides. Downward (and more down than sideways) is a pull;
 *    upward is a scroll, sideways is a row swipe — both are handed back at
 *    once. It has to be the first move, not a few pixels in: iOS commits to
 *    its own scroll (the rubber band) on the first touchmove it is allowed to
 *    keep, so a pull that waited would be fighting a bounce already underway.
 *  · The threshold is FINGER travel. What the page shows is that travel with
 *    resistance (resist()), so the content lags the finger the way iOS does.
 *  · Releasing short of the threshold springs back with no refresh, a
 *    touchcancel never refreshes, and nothing starts while a refresh is running.
 */

/** Finger travel, in px, that arms a refresh: release past this and it runs. */
export const PULL_THRESHOLD = 64

/** Where the content rests (displayed px) while the refresh runs. */
export const PULL_HOLD = 52

/** The resisted offset approaches this and never passes it. */
export const PULL_MAX = 140

/**
 * The displayed offset for a finger travel of `d` px: 1:1 at first, then
 * stiffer the further it goes (an exponential approach to PULL_MAX), so a long
 * drag never drags the page half off the screen.
 */
export function resist(d: number): number {
  if (!(d > 0)) return 0
  return PULL_MAX * (1 - Math.exp(-d / PULL_MAX))
}

/** 0 → 1 as the finger approaches the threshold (drives the spinner's fade and turn). */
export function pullProgress(d: number): number {
  if (!(d > 0)) return 0
  return Math.min(1, d / PULL_THRESHOLD)
}

export type PullState =
  | { kind: "idle" }
  /** Finger down at the top; no move yet. */
  | { kind: "tracking"; startX: number; startY: number }
  /** Engaged: this gesture belongs to the pull. `distance` is finger travel. */
  | { kind: "pulling"; startY: number; distance: number }
  | { kind: "refreshing" }

export type PullEvent =
  /** `atTop`: the page (and anything scrollable under the finger) is at its very top. */
  | { type: "start"; x: number; y: number; atTop: boolean }
  | { type: "move"; x: number; y: number }
  | { type: "end" }
  | { type: "cancel" }
  /** The refresh settled — succeeded or failed. */
  | { type: "done" }

export const IDLE: PullState = { kind: "idle" }

/**
 * One step of the gesture. `refresh` is true on exactly the step that should
 * start a refresh — the release past the threshold — and on no other.
 */
export function stepPull(state: PullState, event: PullEvent): { state: PullState; refresh: boolean } {
  const stay = { state, refresh: false }
  if (state.kind === "refreshing") {
    // Nothing starts while a refresh runs; only its settling ends it.
    return event.type === "done" ? { state: IDLE, refresh: false } : stay
  }
  switch (event.type) {
    case "start":
      return { state: event.atTop ? { kind: "tracking", startX: event.x, startY: event.y } : IDLE, refresh: false }
    case "move": {
      if (state.kind === "tracking") {
        const dx = event.x - state.startX
        const dy = event.y - state.startY
        if (dx === 0 && dy === 0) return stay
        // Down, and more down than sideways: a pull. Anything else is a scroll
        // or a swipe, and the gesture is handed back for good.
        if (dy > 0 && dy >= Math.abs(dx)) return { state: { kind: "pulling", startY: state.startY, distance: dy }, refresh: false }
        return { state: IDLE, refresh: false }
      }
      if (state.kind === "pulling") {
        return { state: { ...state, distance: Math.max(0, event.y - state.startY) }, refresh: false }
      }
      return stay
    }
    case "end":
      if (state.kind === "pulling" && state.distance >= PULL_THRESHOLD) return { state: { kind: "refreshing" }, refresh: true }
      return { state: IDLE, refresh: false }
    case "cancel":
      return { state: IDLE, refresh: false }
    case "done":
      return stay
  }
}

/** True while this gesture is the pull's — the touchmove must be kept from scrolling. */
export function ownsGesture(state: PullState): boolean {
  return state.kind === "pulling"
}
