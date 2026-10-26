import { useCallback } from "react"

/**
 * The CSS variable a page's fixed bottom bar publishes its height through, so
 * the app-wide floating chrome that also lives at the bottom of the screen —
 * the parse tray pill and the UndoBar — can stand on top of it instead of on
 * it. Unset (0) on every page without such a bar.
 */
export const PAGE_BAR_VAR = "--hh-page-bar-h"

/**
 * Callback ref for a page-owned bar fixed to the bottom of the screen (the task
 * page's Mark done, the Deep Clean session footer). While the bar is mounted,
 * its rendered height is written to {@link PAGE_BAR_VAR} on <html> and kept
 * current as it changes (an error line under Mark done makes it taller; a
 * `display:none` at a wider breakpoint makes it 0). Unmounting clears it.
 *
 * Why <html> and not a wrapper: the tray pill is a sibling of the page in
 * AppLayout, not a descendant, so an inherited variable would never reach it.
 */
export function usePageBar(): (el: HTMLElement | null) => (() => void) | undefined {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return undefined
    const root = document.documentElement
    const publish = () => root.style.setProperty(PAGE_BAR_VAR, `${el.offsetHeight}px`)
    publish()
    // jsdom has no ResizeObserver; the first measurement above still lands.
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      root.style.removeProperty(PAGE_BAR_VAR)
    }
  }, [])
}
