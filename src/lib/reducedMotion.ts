/**
 * The iOS Reduce Motion setting (prefers-reduced-motion), read at the moment
 * it matters — when a scroll or a gesture frame is about to move something —
 * so a change in Settings applies to the next one without a re-render.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
