import { useCallback, useSyncExternalStore, type RefObject } from "react"

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

/**
 * How much bottom padding a bottom-anchored container needs so its last child
 * ends at the keyboard's top edge: the keyboard's overlap, minus the part of it
 * that already lies BELOW the container (innerHeight − container bottom).
 *
 * Measured from the container's real position, not assumed flush with the
 * viewport bottom, because it isn't: Ask's container is 48px short of the
 * screen below md (its height allows for a header only md+ has), and WebKit
 * scrolls the WINDOW to reveal a focused field (window.scrollY, which
 * visualViewport.offsetTop does not include), moving the container up. Both
 * are absorbed here; padding by the raw overlap left the composer ~73px above
 * the keyboard.
 */
export function keyboardPadding(overlap: number, innerHeight: number, containerBottom: number): number {
  return Math.max(0, Math.round(overlap - (innerHeight - containerBottom)))
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
  // The window scrolling moves a container without changing the overlap.
  window.addEventListener("scroll", onChange, { passive: true })
  return () => {
    vv.removeEventListener("resize", onChange)
    vv.removeEventListener("scroll", onChange)
    window.removeEventListener("resize", onChange)
    window.removeEventListener("scroll", onChange)
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

/**
 * {@link keyboardPadding} for the element in `ref`, live: the bottom padding
 * that puts the element's last child at the keyboard's top edge. 0 while the
 * keyboard is closed (and wherever `visualViewport` does not exist), so the
 * caller's own padding applies untouched.
 */
export function useKeyboardPadding(ref: RefObject<HTMLElement | null>): number {
  const getPadding = useCallback(() => {
    const overlap = keyboardOverlap(window.innerHeight, viewport())
    if (overlap === 0) return 0
    const el = ref.current
    if (!el) return overlap
    return keyboardPadding(overlap, window.innerHeight, el.getBoundingClientRect().bottom)
  }, [ref])
  return useSyncExternalStore(subscribe, getPadding, getServerSnapshot)
}
