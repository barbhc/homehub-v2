import { SHEET_FLICK_VELOCITY } from "@/lib/motion"

/**
 * The bottom sheet's gesture maths, kept pure so the decisions can be pinned
 * by unit tests without a browser (src/components/ui/BottomSheet.tsx owns the
 * pointer events and the springs).
 *
 * Values follow the approved demo (https://claude.ai/artifact/1DwQLYdx2ewMk3RoYrxp8t):
 * the sheet tracks the finger 1:1 downward, resists upward at a fifth of the
 * finger's travel, and on release closes when it is past 30% of its height or
 * was flicked down faster than SHEET_FLICK_VELOCITY.
 */

/** Past this fraction of its own height, a released sheet closes. */
export const DISMISS_FRACTION = 0.3

/** Upward travel is resisted: the sheet moves this fraction of the finger. */
export const RUBBER_BAND = 0.2

/** Release velocity is measured over the last this-many milliseconds of the
 *  drag, so a finger that stopped before lifting reads as 0, not as the speed
 *  it had earlier. */
export const VELOCITY_WINDOW_MS = 100

/** Where the sheet sits for a finger `offset` px below where the drag began
 *  (negative = above): 1:1 downward, rubber-banded upward. */
export function rubberBand(offset: number): number {
  return offset < 0 ? offset * RUBBER_BAND : offset
}

/** One pointer sample: [timestamp ms, clientY px]. */
export type DragSample = readonly [number, number]

/**
 * Release velocity in px/s (positive = downward), from the samples inside the
 * last VELOCITY_WINDOW_MS before `releaseAt`. Fewer than two samples in the
 * window — the finger held still before lifting — is 0.
 */
export function releaseVelocity(samples: readonly DragSample[], releaseAt: number): number {
  const recent = samples.filter(([t]) => t >= releaseAt - VELOCITY_WINDOW_MS)
  if (recent.length < 2) return 0
  const [t0, y0] = recent[0]
  const [t1, y1] = recent[recent.length - 1]
  if (t1 <= t0) return 0
  return (y1 - y0) / ((t1 - t0) / 1000)
}

export type ReleaseDecision =
  /** Close the sheet, carrying the release velocity into the closing spring. */
  | "dismiss"
  /** Spring back to rest with the release velocity. */
  | "settle"
  /** The person meant to close it, but it holds unsaved input: spring back
   *  and ask "Discard changes?" instead of losing it. */
  | "confirm-discard"

/**
 * What a released drag does. `offset` is how far below rest the sheet sits
 * (px), `height` the sheet's own height, `velocity` the release velocity
 * (px/s, positive = downward), `dirty` whether the sheet holds unsaved input.
 */
export function releaseDecision({
  offset, height, velocity, dirty,
}: { offset: number; height: number; velocity: number; dirty: boolean }): ReleaseDecision {
  const wantsClose = offset > height * DISMISS_FRACTION || velocity > SHEET_FLICK_VELOCITY
  if (!wantsClose) return "settle"
  return dirty ? "confirm-discard" : "dismiss"
}

/** A non-drag dismissal (scrim tap, Escape, the close button). */
export function dismissDecision(dirty: boolean): "dismiss" | "confirm-discard" {
  return dirty ? "confirm-discard" : "dismiss"
}

/** How dim the scrim is (0–1) for a sheet `offset` px below rest. */
export function scrimFor(offset: number, height: number): number {
  if (height <= 0) return 1
  return Math.max(0, Math.min(1, 1 - offset / height))
}
