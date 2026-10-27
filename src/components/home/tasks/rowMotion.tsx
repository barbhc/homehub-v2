// ── Task rows that move: expand, press, leave, come back, swipe ──────────────
// Apple polish phase 2 (motion). One implementation for every task list — Home's
// week list, the Tasks rows (phone and desktop) — on the tokens in
// src/lib/motion.ts and the approved demo
// (https://claude.ai/artifact/1DwQLYdx2ewMk3RoYrxp8t).
//
// Rules this file keeps:
// - DATA FIRST. Done/Snooze still change the list at once (useTaskActions, with
//   its error path and rollback untouched). A row that has left the data is
//   kept on screen by <AnimatePresence> only while its exit plays.
// - NO RE-RENDERS WHILE MOVING. Offsets, heights and fades are written straight
//   to the element; press/reveal/armed/ticked are data-* attributes the row's
//   classes read. Nothing is left inline at rest.
// - INTERRUPTIBLE. Tapping a row mid-expand reverses it; grabbing a row
//   mid-spring takes it over; Undo mid-exit brings the row straight back.
// - REDUCE MOTION. No slides: expand is instant, a leaving row fades and the
//   list closes at once. The finger still moves a row directly.
// - NOTHING TO SEE, NOTHING TO ANIMATE. A row with no layout (the tree the
//   Tasks page hides with CSS, jsdom) changes at once.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { usePresence, useReducedMotion, type AnimationPlaybackControls } from "motion/react"
import { DURATION } from "@/lib/motion"
import { peekLeaving } from "./rowIntents"
import { CLOSE_OVERLAP_S, SLIDE_S, TICK_LEAD_S, clearStyles, enterEase, exitEase, laidOut, tween } from "./rowAnim"

// ── Expand / collapse ─────────────────────────────────────────────────────────

/**
 * A row's expanded part. Height grows over --dur-move on ease-out (shrinks on
 * ease-in) while the content fades over --dur-fade. Interruptible: closing
 * mid-open shrinks from wherever it got to, and vice versa. Under Reduce
 * Motion it opens at full height with a fade and closes at once.
 *
 * Children render only while open or closing, so a closed row costs nothing.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open)
  // Opening mounts the content in the same render, so the layout effect below
  // can measure it before the first paint.
  if (open && !shown) setShown(true)
  const ref = useRef<HTMLDivElement>(null)
  const reduce = !!useReducedMotion()
  const anims = useRef<AnimationPlaybackControls[]>([])
  const gen = useRef(0)
  const first = useRef(true)
  /** The element the last run saw: a new one is a fresh mount, which grows from 0. */
  const seen = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      seen.current = ref.current
      return
    }
    const g = ++gen.current
    for (const a of anims.current) a.stop()
    anims.current = []
    const el = ref.current
    if (!el) return
    const fresh = seen.current !== el
    seen.current = el
    const settle = () => {
      if (gen.current === g) clearStyles(el, "height", "opacity", "overflow")
    }
    if (open) {
      if (!laidOut(el)) return settle()
      const fromOpacity = fresh ? 0 : Number(getComputedStyle(el).opacity)
      if (reduce) {
        anims.current.push(tween(el, "opacity", fromOpacity, 1, { duration: DURATION.fade, ease: "linear" }, settle))
        return
      }
      const from = fresh ? 0 : el.getBoundingClientRect().height
      el.style.overflow = "hidden"
      // scrollHeight is the content's own height whatever the inline height is.
      const to = el.scrollHeight
      anims.current.push(tween(el, "height", from, to, { duration: DURATION.move, ease: enterEase }, settle))
      anims.current.push(tween(el, "opacity", fromOpacity, 1, { duration: DURATION.fade, ease: "linear" }))
      return
    }
    const gone = () => {
      if (gen.current === g) setShown(false)
    }
    if (!laidOut(el) || reduce) return gone()
    el.style.overflow = "hidden"
    const from = el.getBoundingClientRect().height
    const fromOpacity = Number(getComputedStyle(el).opacity)
    anims.current.push(tween(el, "height", from, 0, { duration: DURATION.move, ease: exitEase }, gone))
    anims.current.push(tween(el, "opacity", fromOpacity, 0, { duration: DURATION.fade, ease: "linear" }))
  }, [open, reduce])

  useEffect(
    () => () => {
      for (const a of anims.current) a.stop()
    },
    [],
  )

  if (!shown) return null
  return <div ref={ref}>{children}</div>
}

/** The chevron turns rather than swapping: one glyph, rotated 180° over --dur-move. */
// ── A group whose last row is leaving ─────────────────────────────────────────

/**
 * A Tasks group (header + card). When its last row leaves, the group goes
 * with it: rather than vanish (and jump the groups below), it closes up just
 * as that row's own close-up starts. Mount as a direct child of
 * <AnimatePresence>, with the rows inside an <AnimatePresence propagate> so
 * the row still plays its own exit.
 */
export function PresenceGroup({ ids, className, children }: { ids: string[]; className?: string; children: ReactNode }) {
  const [isPresent, safeToRemove] = usePresence()
  const reduce = !!useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const live = useRef({ ids, safeToRemove, reduce })
  useEffect(() => {
    live.current = { ids, safeToRemove, reduce }
  })
  useEffect(() => {
    const el = ref.current
    if (isPresent) {
      // Back mid-exit (Undo inside the animation): whole again at once.
      clearStyles(el, "height", "marginBottom", "overflow")
      return
    }
    const { ids: last, safeToRemove: remove } = live.current
    const intent = last.map(peekLeaving).find(Boolean) ?? null
    if (!intent || !laidOut(el)) {
      remove?.()
      return
    }
    if (live.current.reduce) {
      const t = window.setTimeout(() => remove?.(), DURATION.fade * 1000)
      return () => window.clearTimeout(t)
    }
    const delay = intent.kind === "tick" ? TICK_LEAD_S + SLIDE_S - CLOSE_OVERLAP_S : intent.kind === "button" ? SLIDE_S - CLOSE_OVERLAP_S : 0.15
    el.style.overflow = "hidden"
    const margin = parseFloat(getComputedStyle(el).marginBottom) || 0
    const anims = [
      tween(el, "height", el.getBoundingClientRect().height, 0, { duration: DURATION.move, ease: exitEase, delay }, () => remove?.()),
      tween(el, "marginBottom", margin, 0, { duration: DURATION.move, ease: exitEase, delay }),
    ]
    return () => {
      for (const a of anims) a.stop()
    }
  }, [isPresent])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

