import { useState } from "react"

/**
 * Whether a page's content should fade in: true once a loading skeleton has
 * actually been on screen during this mount and has now given way to content.
 *
 * Gated on what was SHOWN, never on SWR's `isLoading`: SWR reports isLoading
 * true while it revalidates data that came from `fallback` (the persisted warm
 * start), so a warm render — content on the very first frame — would fade in
 * as if it had just loaded. A warm page must simply be there; only content
 * that replaces a skeleton the user was looking at crossfades in (owner's
 * Phase 2 motion plan: "skeleton → content", --dur-fade).
 *
 * The class this drives (`hh-fade-in`, index.css) is a CSS animation, so it
 * plays once when the content element mounts and never again on re-renders.
 */
export function useFadeAfterSkeleton(skeletonShown: boolean): boolean {
  const [sawSkeleton, setSawSkeleton] = useState(skeletonShown)
  // Render-phase update (the useDepsChanged pattern): the render that first
  // shows a skeleton records it, so the content render after it fades.
  if (skeletonShown && !sawSkeleton) setSawSkeleton(true)
  return fadeAfterSkeleton(sawSkeleton || skeletonShown, skeletonShown)
}

/** The rule, pure: fade only content that follows a skeleton the user saw. */
export function fadeAfterSkeleton(sawSkeleton: boolean, skeletonShownNow: boolean): boolean {
  return sawSkeleton && !skeletonShownNow
}
