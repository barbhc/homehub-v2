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
