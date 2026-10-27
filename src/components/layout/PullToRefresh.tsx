import { useEffect, useRef, useState } from "react"
import { RotateCwIcon } from "lucide-react"
import { DURATION, SPRING_SHEET } from "@/lib/motion"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { springTo, tweenTo } from "@/lib/spring"
import { IDLE, PULL_HOLD, ownsGesture, pullProgress, resist, stepPull, type PullEvent, type PullState } from "@/lib/pullToRefresh"

type PullToRefreshProps = React.ComponentProps<"div"> & {
  /**
   * The page's own reload — the same path its "Try again" uses — so a failed
   * pull lands in the page's existing error state, never a silent no-op.
   */
  onRefresh: () => Promise<unknown>
  /** Off (desktop, a mouse) means no listeners at all and a plain div. */
  enabled: boolean
}

const SPINNER = 36

/**
 * Pull to refresh on a phone page (Home, Tasks): at the very top of the page,
 * pulling down reveals a spinner that follows the finger with resistance;
 * letting go past the threshold reloads the page's data, holds the spinner
 * until the reload settles, then springs back (SPRING_SHEET). Short of the
 * threshold it springs back and nothing is fetched. The gesture rules live in
 * src/lib/pullToRefresh.ts.
 *
 * Renders the page's root div itself (className passes through), with a
 * zero-height spinner anchor as its first child, so the page's layout is
 * untouched at rest — no wrapper in the flex/space-y flow, and no transform
 * left behind (a transform on an ancestor would re-anchor `position: fixed`
 * children such as the Undo bar).
 *
 * Touch only, by construction: it listens for touch events, which a mouse
 * never sends. The listeners sit on this element, not the window, so a touch
 * in a sheet or dialog (portalled outside it) is never a pull. The touchmove
 * listener is non-passive so a pull can keep iOS from rubber-banding the same
 * drag — but it calls preventDefault ONLY while a pull owns the gesture, which
 * can only begin with the first move of a touch that landed at the top and
 * went down. Every other touch scrolls exactly as before.
 *
 * Reduce Motion: the page does not move. The spinner fades in where it sits
 * as the pull arms, keeps turning while the reload runs (a progress spinner,
 * like iOS's own), and fades out when it settles.
 */
export function PullToRefresh({ onRefresh, enabled, children, ...props }: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<SVGSVGElement>(null)
  const [refreshing, setRefreshing] = useState(false)

  // The latest props, read by listeners that are attached once.
  const latest = useRef({ onRefresh })
  useEffect(() => {
    latest.current = { onRefresh }
  })

  useEffect(() => {
    const root = rootRef.current
    if (!enabled || !root) return
    let state: PullState = IDLE
    let offset = 0
    let stopAnim: (() => void) | null = null

    /**
     * Paint one frame: the page offset (none under Reduce Motion), the
     * spinner's place and opacity, and — while pulling — its turn, which says
     * how close the release is to counting.
     */
    const paint = (displayed: number, opacity: number, turn: number | null) => {
      offset = displayed
      const reduce = prefersReducedMotion()
      const spinner = spinnerRef.current
      const icon = iconRef.current
      root.style.transform = !reduce && displayed > 0 ? `translate3d(0, ${displayed}px, 0)` : ""
      if (spinner) {
        // Centred in the gap the page leaves above itself. The spinner rides
        // inside the page, so it is lifted back by the page's own offset.
        const y = reduce ? 8 : displayed / 2 - SPINNER / 2 - displayed
        spinner.style.transform = `translate3d(-50%, ${y}px, 0)`
        spinner.style.opacity = String(Math.max(0, Math.min(1, opacity)))
      }
      if (icon && turn !== null) icon.style.transform = `rotate(${Math.round(turn * 270)}deg)`
    }

    /** Ease to rest or to the hold — a spring when the page moves, a fade when it doesn't. */
    const settle = (to: number, spinning: boolean) => {
      stopAnim?.()
      const from = offset
      const fromOpacity = Number(spinnerRef.current?.style.opacity || 0)
      const toOpacity = spinning ? 1 : 0
      if (spinning && iconRef.current) iconRef.current.style.transform = ""
      if (prefersReducedMotion()) {
        stopAnim = tweenTo(fromOpacity, toOpacity, DURATION.fade, (o) => paint(0, o, null))
        return
      }
      // Toward the hold the spinner is fully shown; toward rest it fades with
      // the distance still to travel.
      stopAnim = springTo(from, to, SPRING_SHEET, (v) => paint(v, spinning ? 1 : from > 0 ? (fromOpacity * v) / from : 0, null))
    }

    const refresh = () => {
      setRefreshing(true)
      settle(PULL_HOLD, true)
      // The page's own reload path: on failure it sets the page's error state
      // (Home's "couldn't reach the server" note, Tasks' StaleDataNote), which
      // is what the user sees. Logged here too so a rejected promise is never
      // swallowed.
      Promise.resolve()
        .then(() => latest.current.onRefresh())
        .catch((err: unknown) => {
          console.error("[pull-to-refresh] refresh failed:", err instanceof Error ? err.message : err)
        })
        .finally(() => {
          state = stepPull(state, { type: "done" }).state
          setRefreshing(false)
          settle(0, false)
        })
    }

    const feed = (event: PullEvent) => {
      const prev = state
      const next = stepPull(state, event)
      state = next.state
      if (next.refresh) {
        refresh()
        return
      }
      if (state.kind === "pulling") {
        stopAnim?.()
        const progress = pullProgress(state.distance)
        paint(prefersReducedMotion() ? 0 : resist(state.distance), progress, progress)
      } else if (prev.kind === "pulling") {
        // Released short of the threshold, or cancelled: back to rest, no refresh.
        settle(0, false)
      }
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        feed({ type: "cancel" })
        return
      }
      const t = e.touches[0]
      feed({ type: "start", x: t.clientX, y: t.clientY, atTop: atTop(e.target, root) })
    }
    const onMove = (e: TouchEvent) => {
      if (state.kind === "idle" || state.kind === "refreshing") return
      const t = e.touches[0]
      if (!t) return
      feed({ type: "move", x: t.clientX, y: t.clientY })
      if (ownsGesture(state) && e.cancelable) e.preventDefault()
    }
    const onEnd = () => feed({ type: "end" })
    const onCancel = () => feed({ type: "cancel" })

    root.addEventListener("touchstart", onStart, { passive: true })
    root.addEventListener("touchmove", onMove, { passive: false })
    root.addEventListener("touchend", onEnd, { passive: true })
    root.addEventListener("touchcancel", onCancel, { passive: true })
    return () => {
      root.removeEventListener("touchstart", onStart)
      root.removeEventListener("touchmove", onMove)
      root.removeEventListener("touchend", onEnd)
      root.removeEventListener("touchcancel", onCancel)
      stopAnim?.()
      root.style.transform = ""
    }
  }, [enabled])

  return (
    <div ref={rootRef} {...props}>
      {enabled && (
        <div aria-hidden="true" className="pointer-events-none relative z-10 h-0">
          <div
            ref={spinnerRef}
            data-pull-spinner=""
            className="absolute left-1/2 top-0 flex items-center justify-center rounded-full"
            style={{
              width: SPINNER,
              height: SPINNER,
              opacity: 0,
              background: "var(--hh-surface)",
              border: "1px solid var(--hh-line)",
              boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
            }}
          >
            <RotateCwIcon ref={iconRef} className={refreshing ? "size-[18px] animate-spin" : "size-[18px]"} style={{ color: "var(--hh-teal)" }} strokeWidth={2.4} />
          </div>
        </div>
      )}
      {refreshing && <span role="status" className="sr-only">Refreshing…</span>}
      {children}
    </div>
  )
}

/**
 * The page is at its very top, and so is every scroller between the finger and
 * the page — a touch inside a list that scrolls on its own is that list's.
 * iOS reports a negative scrollY during its own bounce; that is "at the top".
 */
function atTop(target: EventTarget | null, root: HTMLElement): boolean {
  if (window.scrollY > 0) return false
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.scrollTop > 0) return false
  }
  return true
}
