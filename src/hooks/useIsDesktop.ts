import { useSyncExternalStore } from "react"

/**
 * Tailwind's `lg` breakpoint, written the way Tailwind 4 writes it
 * (`--breakpoint-lg: 64rem`). At the default font size that is 1024px; saying
 * it in rem keeps this query and every `lg:` class on the same side of the line
 * when someone raises the browser's base size.
 */
export const DESKTOP_MEDIA_QUERY = "(min-width: 64rem)"

function desktopQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
  return window.matchMedia(DESKTOP_MEDIA_QUERY)
}

function subscribe(onChange: () => void): () => void {
  const mq = desktopQuery()
  if (!mq) return () => {}
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function getSnapshot(): boolean {
  return desktopQuery()?.matches ?? false
}

/** No `matchMedia` to ask: the phone layout, which every page renders first. */
function getServerSnapshot(): boolean {
  return false
}

/**
 * True at the `lg` breakpoint and wider, and it follows the window across it.
 *
 * This exists so a page can render ONE tree for its width. The item page used
 * to mount its phone tree and its desktop tree together and hide one with CSS
 * — but `display:none` does not reach a portal, so each tree's add-manual
 * dialog and review sheet opened at the same moment (HH-159, HH-120 again).
 * Choosing the tree in JS is what makes "one dialog" true by construction.
 *
 * Crossing the line (an iPad rotating) swaps trees, so state local to the
 * unmounted tree is dropped; state the page owns survives.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
