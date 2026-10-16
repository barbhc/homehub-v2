/** How close to the bottom of Ask's thread still counts as "reading the latest". */
export const NEAR_BOTTOM_PX = 120

/**
 * Should the thread keep following the bottom after this scroll?
 * Near the bottom: yes. Moved UP (the reader went back to reread): no.
 * Anything else — a programmatic scroll toward the bottom, content growing —
 * leaves the current answer alone.
 */
export function stillFollowing(args: { top: number; maxTop: number; prevTop: number; following: boolean }): boolean {
  const { top, maxTop, prevTop, following } = args
  if (maxTop - top <= NEAR_BOTTOM_PX) return true
  if (top < prevTop) return false
  return following
}
