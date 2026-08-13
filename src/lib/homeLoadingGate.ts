/**
 * When Home may show its loading skeleton.
 *
 * Extracted as a one-line predicate because getting it wrong is invisible: Home
 * used to gate on SWR's `isLoading` alone, and SWR reports `isLoading: true` for
 * the entire first revalidation whenever the data it already holds came from
 * `fallback` or `keepPreviousData` (that data is not "loaded" by its definition).
 * So a returning user with a perfectly good persisted dashboard got a skeleton
 * painted over it — the blank/skeleton Home on reopen, and it silently defeated
 * the whole warm-start cache.
 *
 * The rule: a skeleton is only ever correct when there is genuinely nothing to
 * paint. If we have data, render it and let the refresh land behind it.
 */
export function shouldShowHomeSkeleton(isLoading: boolean, hasDashboardData: boolean): boolean {
  return isLoading && !hasDashboardData
}

/**
 * How long the shimmering skeleton may run before it has to say something.
 *
 * A tester's first sign-in produced a screen of shimmer that he reported as "a
 * blank Home Screen". He was right to: a skeleton communicates "a moment" and
 * nothing more, so past a few seconds it stops reading as loading and starts
 * reading as broken — with no way to tell which, and nothing to do about it.
 *
 * Six seconds is past a normal cold start (measured ~1-2s warm, ~5s worst case
 * on a cellular first launch) and well short of the 20s fetch timeout that
 * eventually surfaces the real error card.
 */
export const SKELETON_PATIENCE_MS = 6000
