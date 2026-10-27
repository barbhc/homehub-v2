/**
 * Motion tokens for JS-driven animation (Motion springs, Web Animations).
 *
 * CSS twins live in src/index.css ("Motion tokens"); keep the two in step.
 * Springs are what make a sheet or a swiped row feel physical: they carry the
 * finger's release velocity and can be interrupted mid-flight, which a fixed
 * duration cannot. Values match the approved demo
 * (https://claude.ai/artifact/1DwQLYdx2ewMk3RoYrxp8t).
 *
 * Reduce Motion is handled once, by <MotionConfig reducedMotion="user"> in
 * main.tsx: transform animations become instant and opacity still fades.
 */
export const DURATION = {
  /** Press feedback: tint, button shrink, chevron turn. */
  press: 0.12,
  /** Fades: menus, toasts, tab content, skeleton → content. */
  fade: 0.2,
  /** Row expand/collapse, a row leaving, the list closing up. */
  move: 0.28,
} as const

/** Enter on ease-out, leave on ease-in (cubic-bezier control points). */
export const EASE = {
  enter: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const

/** Bottom sheet rising, snapping back, and drag release. */
export const SPRING_SHEET = { type: "spring", stiffness: 420, damping: 38, mass: 1 } as const

/** Swipe release and snap-back on list rows. */
export const SPRING_ROW = { type: "spring", stiffness: 520, damping: 42, mass: 1 } as const

/** A flick faster than this (px/s), in the direction of travel and past
 *  FLICK_MIN_DISTANCE, commits a swipe even short of the commit distance. */
export const FLICK_VELOCITY = 500

/** A downward flick faster than this (px/s) closes a bottom sheet even short
 *  of its 30% distance threshold — the approved demo's value. Sheet-specific,
 *  so it is not FLICK_VELOCITY above, which also needs FLICK_MIN_DISTANCE of
 *  travel: a sheet flick needs none, since closing a sheet is always
 *  reversible by reopening it, and a sheet holding unsaved input asks first. */
export const SHEET_FLICK_VELOCITY = 600

/** Minimum travel (px) before a flick can commit, so a fast jitter can't
 *  mark a task done. */
export const FLICK_MIN_DISTANCE = 16
