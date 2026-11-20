import { useEffect, useRef, useState } from "react"

/**
 * Whether content has scrolled beneath a sticky header — the moment iOS draws
 * the hairline under a bar (a "scroll edge"), and not before.
 *
 * Watches a sentinel placed directly above the sticky element with an
 * IntersectionObserver, never a scroll listener: the browser reports the one
 * crossing, off the main thread, instead of calling back on every frame of a
 * scroll. The sentinel leaves the viewport's top band exactly when the header
 * starts to stick, which is exactly when rows begin to pass under it.
 *
 * `top` is the header's sticky offset in px (its CSS `top`), so the observer's
 * line sits where the header sticks.
 */
export function useScrollEdge({ top = 0 }: { top?: number } = {}) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver !== "function") return
    const io = new IntersectionObserver(
      ([entry]) => setScrolled(scrolledPast(entry)),
      { rootMargin: `${-top}px 0px 0px 0px`, threshold: [0, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [top])

  return { sentinelRef, scrolled }
}

/**
 * The rule, pure: the sentinel has gone ABOVE the line. A sentinel out of view
 * below the fold (a header further down a long page) is not "scrolled".
 */
export function scrolledPast(entry: Pick<IntersectionObserverEntry, "isIntersecting" | "boundingClientRect" | "rootBounds">): boolean {
  if (entry.isIntersecting) return false
  const lineTop = entry.rootBounds?.top ?? 0
  return entry.boundingClientRect.bottom <= lineTop
}
