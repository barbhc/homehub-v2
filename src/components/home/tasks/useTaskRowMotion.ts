// The task-row hooks: the press tint, and a row that leaves, comes back and
// swipes. See rowMotion.tsx for the rules both keep.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { animate, motionValue, usePresence, useReducedMotion, type AnimationPlaybackControls } from "motion/react"
import { DURATION, SPRING_ROW } from "@/lib/motion"
import { PRESS, SWIPE, isArmed, releaseVelocity, resist, swipeDecision, type Sample } from "./rowGesture"
import { cancelLeaving, markLeaving, peekLeaving, takeReturning, type LeaveIntent } from "./rowIntents"
import {
  CLOSE_OVERLAP_S, DONE_STUCK_MS, OFFSCREEN_PAD, SLIDE_PX, SLIDE_S, TICK_LEAD_S,
  clearStyles, enterEase, exitEase, laidOut, setAttr, tween,
} from "./rowAnim"

// ── Press tint ────────────────────────────────────────────────────────────────

/**
 * The row washes ~40ms after a finger lands (the delay is what keeps a scroll
 * from flashing every row it crosses), and clears when the finger moves more
 * than 6px or lifts. Writes `data-pressed` on the element the handlers are on;
 * its classes paint it. Controls that carry `data-no-press` (the check circle,
 * which has its own press) don't tint the row.
 */
export function usePressTint() {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number; el: HTMLElement } | null>(null)
  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setAttr(start.current?.el ?? null, "data-pressed", null)
    start.current = null
  }, [])
  useEffect(() => clear, [clear])
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      clear()
      if (e.button > 0 || (e.target as Element).closest("[data-no-press]")) return
      const el = e.currentTarget
      start.current = { x: e.clientX, y: e.clientY, el }
      timer.current = window.setTimeout(() => setAttr(el, "data-pressed", ""), PRESS.delayMs)
    },
    [clear],
  )
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > PRESS.slop) clear()
    },
    [clear],
  )
  return { onPointerDown, onPointerMove, onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear }
}

// ── A row that leaves, comes back, and swipes ─────────────────────────────────

/**
 * Everything a task row does in motion, for one row:
 *
 * - `tick()` — the check circle (and Mark done): the circle fills, the row
 *   slides right 36px and fades, then the list closes up over it.
 * - `snoozeTap()` — the Snooze button: the same, leaving to the left.
 * - a swipe (`swipe: true`): the row follows the finger 1:1 and resists past
 *   60% of its width; Done shows on the left, Snooze on the right, and the icon
 *   grows once letting go would commit (30% of the width, or a flick faster
 *   than FLICK_VELOCITY). Committed, it carries the release velocity off the
 *   row on SPRING_ROW, then the list closes up; otherwise it springs home.
 * - coming back (Undo, or a write that failed): the row grows back in and fades.
 *
 * Mount the row as a direct child of <AnimatePresence>. `rowRef` is the
 * element that collapses; `slideRef` (optional) is the part that slides and
 * fades — the row itself when omitted.
 */
export function useTaskRowMotion({
  id, error, onDone, onSnooze, swipe = false,
}: {
  id: string
  /** This row's failed Done/Snooze, if any. A committed swipe springs home when one arrives. */
  error: string | null
  onDone: () => void
  onSnooze: () => void
  swipe?: boolean
}) {
  const [isPresent, safeToRemove] = usePresence()
  const reduce = !!useReducedMotion()
  const rowRef = useRef<HTMLDivElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const [x] = useState(() => motionValue(0))
  const anims = useRef<AnimationPlaybackControls[]>([])
  const xAnim = useRef<AnimationPlaybackControls | null>(null)
  const gen = useRef(0)
  const offscreen = useRef<Promise<void> | null>(null)
  const exiting = useRef(false)
  const present = useRef(isPresent)
  const live = useRef({ onDone, onSnooze, safeToRemove, reduce })
  useEffect(() => {
    live.current = { onDone, onSnooze, safeToRemove, reduce }
    present.current = isPresent
  })

  const slideEl = useCallback(() => slideRef.current ?? rowRef.current, [])

  // The offset is written straight to the element; at rest nothing is left inline.
  useLayoutEffect(
    () =>
      x.on("change", (v) => {
        const el = slideEl()
        if (el) el.style.transform = Math.abs(v) < 0.05 ? "" : `translateX(${v}px)`
      }),
    [x, slideEl],
  )

  const stopAll = useCallback(() => {
    for (const a of anims.current) a.stop()
    anims.current = []
    xAnim.current?.stop()
    xAnim.current = null
  }, [])
  useEffect(() => stopAll, [stopAll])

  const clearRow = useCallback(() => {
    const row = rowRef.current
    clearStyles(row, "height", "opacity", "overflow")
    clearStyles(slideEl(), "opacity")
    setAttr(row, "data-reveal", null)
    setAttr(row, "data-armed", null)
    setAttr(row, "data-ticked", null)
  }, [slideEl])

  /** Home again — on SPRING_ROW carrying the finger's velocity, or at once under Reduce Motion. */
  const springHome = useCallback(
    (velocity: number) => {
      xAnim.current?.stop()
      const settle = () => {
        setAttr(rowRef.current, "data-reveal", null)
        setAttr(rowRef.current, "data-armed", null)
      }
      if (live.current.reduce || x.get() === 0) {
        x.set(0)
        settle()
        return
      }
      xAnim.current = animate(x, 0, { ...SPRING_ROW, velocity, onComplete: settle })
    },
    [x],
  )

  // ── Leaving: the exit, played after the row has left the data ──
  useEffect(() => {
    if (isPresent) {
      if (!exiting.current) return
      // Back mid-exit (Undo inside the animation): reverse from wherever it got to.
      exiting.current = false
      cancelLeaving(id)
      const g = ++gen.current
      stopAll()
      const row = rowRef.current
      if (!row) return
      const slide = slideEl() ?? row
      const settle = () => {
        if (gen.current === g) clearRow()
      }
      setAttr(row, "data-ticked", null)
      if (live.current.reduce) {
        x.set(0)
        row.style.height = ""
        anims.current.push(tween(row, "opacity", Number(getComputedStyle(row).opacity), 1, { duration: DURATION.fade, ease: "linear" }, settle))
        return
      }
      xAnim.current = animate(x, 0, { ...SPRING_ROW })
      anims.current.push(tween(slide, "opacity", Number(getComputedStyle(slide).opacity), 1, { duration: DURATION.fade, ease: "linear" }))
      anims.current.push(tween(row, "height", row.getBoundingClientRect().height, row.scrollHeight, { duration: DURATION.move, ease: enterEase }, settle))
      return
    }
    exiting.current = true
    const row = rowRef.current
    const intent: LeaveIntent | null = peekLeaving(id)
    const remove = () => live.current.safeToRemove?.()
    // Left for some other reason (a filter, a refetch) — or there is nothing on screen to move.
    if (!intent || !laidOut(row)) return remove()
    const g = ++gen.current
    const done = () => {
      if (gen.current === g) remove()
    }
    const slide = slideEl() ?? row
    if (live.current.reduce) {
      // No slide: fade where it stands, then the list closes at once.
      for (const a of anims.current) a.stop()
      anims.current = [tween(row, "opacity", 1, 0, { duration: DURATION.fade, ease: "linear" }, () => {
        if (gen.current !== g) return
        row.style.height = "0px"
        done()
      })]
      return
    }
    const closeUp = (delay: number) => {
      row.style.overflow = "hidden"
      anims.current.push(tween(row, "height", row.getBoundingClientRect().height, 0, { duration: DURATION.move, ease: exitEase, delay }, done))
    }
    if (intent.kind === "swipe" && offscreen.current) {
      // Already travelling off the row on its spring: close up once it is off.
      void offscreen.current.then(() => {
        if (gen.current === g) closeUp(0)
      })
      return
    }
    for (const a of anims.current) a.stop()
    anims.current = []
    xAnim.current?.stop()
    const lead = intent.kind === "tick" ? TICK_LEAD_S : 0
    xAnim.current = animate(x, SLIDE_PX * intent.dir, { duration: SLIDE_S, ease: exitEase, delay: lead })
    anims.current.push(tween(slide, "opacity", 1, 0, { duration: SLIDE_S, ease: "linear", delay: lead }))
    closeUp(lead + SLIDE_S - CLOSE_OVERLAP_S)
  }, [isPresent, id, x, stopAll, slideEl, clearRow])

  // ── Coming back: a fresh mount after Undo, or after a write that failed ──
  // The claim on the return is held in a ref so a re-run of this effect (React
  // StrictMode mounts effects twice) replays the entrance instead of losing it
  // half-started — which left a dev row stuck at height 0.
  const returning = useRef<boolean | null>(null)
  useLayoutEffect(() => {
    const row = rowRef.current
    // Only the tree on screen takes the return (the other has no layout).
    if (!laidOut(row)) return
    if (returning.current === null) returning.current = takeReturning(id)
    if (!returning.current) return
    cancelLeaving(id)
    const slide = slideEl() ?? row
    const own: AnimationPlaybackControls[] = []
    const settle = () => {
      returning.current = false
      clearRow()
    }
    if (live.current.reduce) {
      own.push(tween(row, "opacity", 0, 1, { duration: DURATION.fade, ease: "linear" }, settle))
    } else {
      const h = row.offsetHeight
      row.style.overflow = "hidden"
      own.push(tween(row, "height", 0, h, { duration: DURATION.move, ease: enterEase }, settle))
      own.push(tween(slide, "opacity", 0, 1, { duration: DURATION.fade, ease: "linear", delay: 0.08 }))
    }
    return () => {
      for (const a of own) a.stop()
      clearRow()
    }
  }, [id, slideEl, clearRow])

  // A failed write: the row stays (useTaskActions put it back, with the
  // reason on it) — so a swipe that had thrown it off springs home.
  useEffect(() => {
    if (!error) return
    cancelLeaving(id)
    setAttr(rowRef.current, "data-ticked", null)
    if (x.get() !== 0) springHome(0)
  }, [error, id, x, springHome])

  /** A Done should leave the data in the same event; one that didn't (no home yet) puts the row back. */
  const watchStuck = useCallback(() => {
    const g = gen.current
    window.setTimeout(() => {
      if (!present.current || gen.current !== g) return
      cancelLeaving(id)
      setAttr(rowRef.current, "data-ticked", null)
      springHome(0)
    }, DONE_STUCK_MS)
  }, [id, springHome])

  const tick = useCallback(() => {
    if (!present.current) return
    setAttr(rowRef.current, "data-ticked", "")
    markLeaving(id, 1, "tick")
    live.current.onDone()
    watchStuck()
  }, [id, watchStuck])

  const snoozeTap = useCallback(() => {
    if (!present.current) return
    setAttr(rowRef.current, "data-ticked", null)
    markLeaving(id, -1, "button")
    live.current.onSnooze()
  }, [id])

  // ── The swipe ──
  const drag = useRef<{ pointer: number; x0: number; y0: number; base: number; axis: "x" | "y" | null; w: number; samples: Sample[] } | null>(null)
  /** True between a drag's release and the click the browser fires after it. */
  const dragged = useRef(false)
  const press = usePressTint()

  const showOffset = useCallback((off: number, w: number) => {
    const row = rowRef.current
    setAttr(row, "data-reveal", off > 0 ? "done" : off < 0 ? "snooze" : null)
    setAttr(row, "data-armed", isArmed(off, w) ? "" : null)
  }, [])

  const commitSwipe = useCallback(
    (action: "done" | "snooze", velocity: number, w: number) => {
      const dir = action === "done" ? 1 : -1
      markLeaving(id, dir, "swipe")
      setAttr(rowRef.current, "data-ticked", null)
      xAnim.current?.stop()
      if (live.current.reduce) {
        offscreen.current = Promise.resolve()
      } else {
        offscreen.current = new Promise<void>((resolve) => {
          const unsub = x.on("change", (v) => {
            if (Math.abs(v) >= w) {
              unsub()
              resolve()
            }
          })
          xAnim.current = animate(x, dir * (w + OFFSCREEN_PAD), {
            ...SPRING_ROW,
            velocity,
            onComplete: () => {
              unsub()
              resolve()
            },
          })
        })
      }
      if (action === "done") {
        live.current.onDone()
        watchStuck()
      } else {
        live.current.onSnooze()
      }
    },
    [id, x, watchStuck],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      press.onPointerDown(e)
      if (!swipe || e.button > 0 || !present.current) return
      if ((e.target as Element).closest("[data-no-press]")) return
      // Grabbing a row mid-spring takes it over, from where it is.
      xAnim.current?.stop()
      const base = x.get()
      const row = rowRef.current
      drag.current = {
        pointer: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        base,
        axis: base !== 0 ? "x" : null,
        w: row?.offsetWidth || window.innerWidth,
        samples: [{ t: performance.now(), x: e.clientX }],
      }
      if (base !== 0) {
        dragged.current = true
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* the pointer is already gone: the move handler simply never fires */ }
      }
    },
    [press, swipe, x],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      press.onPointerMove(e)
      const d = drag.current
      if (!d || e.pointerId !== d.pointer) return
      const dx = e.clientX - d.x0
      const dy = e.clientY - d.y0
      if (d.axis === null) {
        // Vertical first: the list scrolls (touch-action: pan-y) and the row stays put.
        if (Math.abs(dy) > SWIPE.axisLock && Math.abs(dy) > Math.abs(dx)) {
          d.axis = "y"
          return
        }
        if (Math.abs(dx) <= SWIPE.axisLock) return
        d.axis = "x"
        dragged.current = true
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* see onPointerDown */ }
      }
      if (d.axis !== "x") return
      const off = resist(d.base + dx, d.w)
      x.set(off)
      showOffset(off, d.w)
      const now = performance.now()
      d.samples.push({ t: now, x: e.clientX })
      while (d.samples.length > 2 && d.samples[0].t < now - SWIPE.velocityWindowMs) d.samples.shift()
    },
    [press, x, showOffset],
  )

  const onPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      press.onPointerUp()
      const d = drag.current
      if (!d || e.pointerId !== d.pointer) return
      drag.current = null
      if (d.axis !== "x") return
      // The click the browser fires after a drag is not a tap.
      window.setTimeout(() => {
        dragged.current = false
      }, 0)
      // pointercancel is the browser taking the pointer (a scroll): never a commit.
      const released = e.type === "pointerup"
      const velocity = released ? releaseVelocity([...d.samples, { t: performance.now(), x: e.clientX }]) : 0
      const action = released ? swipeDecision({ offset: x.get(), velocity, width: d.w }) : null
      if (action) commitSwipe(action, velocity, d.w)
      else springHome(velocity)
    },
    [press, x, commitSwipe, springHome],
  )

  /** For the row's tap handlers: true when the click is the tail of a drag. */
  const wasDrag = useCallback(() => dragged.current, [])

  return {
    rowRef,
    slideRef,
    /** Not present: playing its exit. Inert, and hidden from assistive tech. */
    leaving: !isPresent,
    tick,
    snoozeTap,
    wasDrag,
    /** Spread on the row's surface: the press tint, and the swipe when `swipe` is on. */
    surface: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: press.onPointerLeave,
    },
  }
}

