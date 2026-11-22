import { useId, useRef } from "react"
import { cn } from "@/lib/utils"
import { segmentTabId } from "./segmentIds"

export interface Segment<T extends string> {
  value: T
  /** A noun — the name of the view the segment shows ("Upkeep", "Cleaning"). */
  label: string
}

/**
 * Switches between closely related views of one page (Apple HIG: segmented
 * control — equal-width segments, noun labels, no more than five on iPhone).
 * Tasks uses it for Upkeep | Cleaning, Items for Items | Warranties
 * (design/tasks-items-views.md).
 *
 * The selected segment is raised (--hh-seg-thumb) on a filled track
 * (--hh-seg-track) — a pair of its own, so it reads as raised in dark too.
 * Every segment is at least 44pt tall. It is a tab list for assistive tech — `role="tablist"`, each segment a `role="tab"` with `aria-selected` —
 * and works from the keyboard the way a tab list does: one Tab stop (the
 * selected segment), arrow keys move AND select, Home/End jump to the ends.
 * With `panelId`, every tab `aria-controls` it; the page puts
 * `segmentPanelProps(idBase, value)` on the selected view's container.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  className,
  idBase,
  panelId,
}: {
  segments: readonly Segment<T>[]
  value: T
  onChange: (value: T) => void
  /** The tab list's accessible name ("Tasks view"). */
  label: string
  className?: string
  /** Base for the tabs' ids (segmentTabId), shared with the panel. Defaults to a useId of its own. */
  idBase?: string
  /** The id of the panel showing the selected view — every tab `aria-controls` it. */
  panelId?: string
}) {
  const ownId = useId()
  const baseId = idBase ?? ownId
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (index: number) => {
    const n = segments.length
    const at = ((index % n) + n) % n
    refs.current[at]?.focus()
    if (segments[at].value !== value) onChange(segments[at].value)
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") select(index + 1)
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") select(index - 1)
    else if (e.key === "Home") select(0)
    else if (e.key === "End") select(segments.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn("flex w-full rounded-xl p-[3px]", className)}
      style={{ background: "var(--hh-seg-track)" }}
    >
      {segments.map((s, i) => {
        const on = s.value === value
        return (
          <button
            key={s.value}
            ref={(el) => { refs.current[i] = el }}
            id={segmentTabId(baseId, s.value)}
            aria-controls={panelId}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => { if (!on) onChange(s.value) }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "min-h-11 min-w-0 flex-1 basis-0 rounded-[9px] px-3 text-[0.875rem] tracking-[-0.1px] transition-[background-color,box-shadow] duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--hh-teal)]",
              on ? "font-bold shadow-[0_1px_3px_rgba(15,23,42,0.12)]" : "font-semibold",
            )}
            style={{ background: on ? "var(--hh-seg-thumb)" : "transparent", color: "var(--hh-ink)" }}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
