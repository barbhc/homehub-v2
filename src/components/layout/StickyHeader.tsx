import { cn } from "@/lib/utils"
import { useScrollEdge } from "@/hooks/useScrollEdge"

type StickyHeaderProps = React.ComponentProps<"div"> & {
  /** The sticky offset in px (CSS `top`). Default 0. */
  top?: number
}

/**
 * A sticky header that draws its bottom hairline only once content has
 * scrolled beneath it (iOS's scroll edge), fading it in over --dur-fade.
 * At rest — the page at its top — there is no line and no shadow.
 *
 * Renders a 1px sentinel just above the header (with a -1px margin, so the
 * layout is unchanged) for useScrollEdge to watch. The hairline itself is the
 * `hh-scroll-edge` rule in index.css; `data-scrolled` switches it on.
 *
 * Adopting it: replace `<div className="sticky top-0 …" style={{ …, boxShadow }}>`
 * with `<StickyHeader className="…" style={{ … }}>` and drop the shadow.
 */
export function StickyHeader({ top = 0, className, style, children, ...props }: StickyHeaderProps) {
  const { sentinelRef, scrolled } = useScrollEdge({ top })
  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" data-scroll-edge-sentinel="" className="pointer-events-none -mb-px h-px" />
      <div
        {...props}
        data-scrolled={scrolled ? "" : undefined}
        className={cn("hh-scroll-edge sticky", className)}
        style={{ top, ...style }}
      >
        {children}
      </div>
    </>
  )
}
