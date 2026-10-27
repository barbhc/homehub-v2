// Shared pieces of the task-row motion (rowMotion.tsx, useTaskRowMotion.ts):
// timings from the approved demo, and the tween that writes straight to the
// element so nothing re-renders while a row moves.
import { animate, type AnimationPlaybackControls } from "motion/react"
import { EASE } from "@/lib/motion"


/** How far a ticked or snoozed row slides as it fades (px). */
export const SLIDE_PX = 36
/** The slide-and-fade (s) — 220ms, ease-in. */
export const SLIDE_S = 0.22
/** A tick fills its circle first; the slide starts as the fill lands (s). */
export const TICK_LEAD_S = 0.1
/** The close-up starts this long before the slide ends, so the list never waits on a ghost (s). */
export const CLOSE_OVERLAP_S = 0.04
/** Past the edge, so the spring has somewhere to settle that is off the row (px). */
export const OFFSCREEN_PAD = 60
/** A Done that should have left the list but didn't (no home yet) springs back after this (ms). */
export const DONE_STUCK_MS = 1200

export const enterEase = [...EASE.enter] as [number, number, number, number]
export const exitEase = [...EASE.exit] as [number, number, number, number]

export type StyleProp = "height" | "opacity" | "marginBottom"

/** Has a box on screen. The hidden tree and jsdom have none, and change at once. */
export function laidOut(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.offsetHeight > 0
}

/** Tween one style property, written straight to the element. */
export function tween(
  el: HTMLElement,
  prop: StyleProp,
  from: number,
  to: number,
  o: { duration: number; ease: [number, number, number, number] | "linear"; delay?: number },
  onComplete?: () => void,
): AnimationPlaybackControls {
  const unit = prop === "opacity" ? "" : "px"
  el.style[prop] = `${from}${unit}`
  return animate(from, to, {
    duration: o.duration,
    ease: o.ease,
    delay: o.delay ?? 0,
    onUpdate: (v) => {
      el.style[prop] = `${v}${unit}`
    },
    onComplete,
  })
}

export function clearStyles(el: HTMLElement | null, ...props: (StyleProp | "overflow")[]) {
  if (!el) return
  for (const p of props) el.style[p] = ""
}

export function setAttr(el: HTMLElement | null, name: string, value: string | null) {
  if (!el) return
  if (value === null) el.removeAttribute(name)
  else el.setAttribute(name, value)
}

export const CHEVRON_TURN =
  "transition-transform duration-(--dur-move) ease-(--ease-enter) motion-reduce:transition-none"

