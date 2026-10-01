import { useState } from "react"

/**
 * True during the render in which any of `deps` differs (`Object.is`, like an
 * effect's dependency list) from the render before it.
 *
 * This is React's "adjust state when a prop changes" pattern
 * (react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes),
 * packaged so a reset that used to be written as
 *
 *     useEffect(() => { if (open) { setPage(pageNumber); setZoom(1) } }, [open, pageNumber])
 *
 * keeps the SAME dependency list and the same body:
 *
 *     if (useDepsChanged([open, pageNumber]) && open) { setPage(pageNumber); setZoom(1) }
 *
 * The difference is when it runs. The effect committed a render with the stale
 * state, then set state and rendered again (react-hooks/set-state-in-effect —
 * "cascading renders"); this runs in the render that changed the deps, so no
 * frame is ever drawn with the old state against the new props.
 *
 * Only for setting THIS component's own state — React allows that during
 * render. Never for side effects: navigation, network or storage writes, a
 * parent's setter. Those stay in effects or event handlers.
 *
 * Deps must keep their identity while they are unchanged: primitives, props,
 * state, memoized values. An object or array built during render is new every
 * render, so it reads as changed every render — and since a change re-renders
 * at once, that loops ("Too many re-renders"). An effect with the same deps
 * merely re-ran; this cannot. Key on the primitive inside (`user?.id`, not
 * `user`) when the object itself is not stable.
 *
 * `onMount: true` also reports the first render, the way an effect also runs
 * on mount. Use it when that mount run set something the initial state does
 * not already hold (a loading flag that starts false, an auth check).
 */
export function useDepsChanged(deps: readonly unknown[], options?: { onMount?: boolean }): boolean {
  const [seen, setSeen] = useState<readonly unknown[] | null>(() => (options?.onMount ? null : deps))
  const changed =
    seen === null || seen.length !== deps.length || deps.some((dep, i) => !Object.is(dep, seen[i]))
  if (changed) setSeen(deps)
  return changed
}
