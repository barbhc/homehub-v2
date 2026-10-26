import { useSyncExternalStore } from "react"

/** The parts of `window.visualViewport` the overlap is computed from. */
export type ViewportLike = { height: number; offsetTop: number; scale?: number }

/**
 * How many CSS pixels at the bottom of the layout viewport the on-screen
 * keyboard covers: innerHeight − visualViewport.height − visualViewport.offsetTop,
 * clamped at 0 and rounded.
 *
 * In WKWebView (the iOS shell) the keyboard shrinks only the VISUAL viewport;
 * the layout viewport — what `100dvh` and `bottom: 0` measure against — stays
 * full height, so anything pinned to the bottom of the page sits under the
 * keyboard. This is the amount to lift it by.
 *
 * A pinch-zoomed viewport (scale ≠ 1) is also smaller than the layout one, but
 * that is the reader zooming, not a keyboard: 0, so the layout doesn't jump.
 */
export function keyboardOverlap(innerHeight: number, vv: ViewportLike | null | undefined): number {
  if (!vv) return 0
  if (vv.scale !== undefined && Math.abs(vv.scale - 1) > 0.01) return 0
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop))
}

function viewport(): VisualViewport | null {
  return typeof window === "undefined" ? null : (window.visualViewport ?? null)
}

function subscribe(onChange: () => void): () => void {
  const vv = viewport()
  if (!vv) return () => {}
  vv.addEventListener("resize", onChange)
  vv.addEventListener("scroll", onChange)
  window.addEventListener("resize", onChange)
  return () => {
    vv.removeEventListener("resize", onChange)
    vv.removeEventListener("scroll", onChange)
    window.removeEventListener("resize", onChange)
  }
}

function getSnapshot(): number {
  return keyboardOverlap(window.innerHeight, viewport())
}

function getServerSnapshot(): number {
  return 0
}

/**
 * The keyboard's overlap of the layout viewport, in px, following it as the
 * keyboard opens, closes and the visual viewport scrolls. 0 when nothing is
 * covered, and always 0 where `visualViewport` does not exist.
 *
 * Web-side on purpose: the iOS shell has no keyboard plugin (and lives in
 * another repo), so the page measures the keyboard itself.
 */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
