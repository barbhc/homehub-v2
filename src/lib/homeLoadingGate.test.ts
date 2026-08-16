/**
 * The Home skeleton gate. The regression this pins is specific: SWR keeps
 * `isLoading` true through the first revalidation when its data came from
 * `fallback`/keepPreviousData, so `isLoading` ALONE hid the warm-start dashboard
 * behind a skeleton on every reopen.
 */
import { describe, it, expect } from "vitest"
import { shouldShowHomeSkeleton } from "./homeLoadingGate"

describe("shouldShowHomeSkeleton", () => {
  it("shows the skeleton on a true cold start (loading, nothing cached)", () => {
    expect(shouldShowHomeSkeleton(true, false)).toBe(true)
  })

  it("does NOT show the skeleton when warm data exists and SWR is revalidating", () => {
    // The regression: isLoading true + data present is the normal reopen state.
    expect(shouldShowHomeSkeleton(true, true)).toBe(false)
  })

  it("does not show the skeleton once loading settles", () => {
    expect(shouldShowHomeSkeleton(false, true)).toBe(false)
  })

  it("does not show the skeleton for a settled empty home (that is the empty state's job)", () => {
    expect(shouldShowHomeSkeleton(false, false)).toBe(false)
  })

  /**
   * Home's boot "content" mark reuses this predicate, because the same trap bit
   * twice: gating the mark on `!isLoading` meant a warm start painted real
   * content at ~600ms and still recorded as "never finished loading" in the
   * owner's startup diagnostics. Content is painted exactly when the skeleton
   * is not showing and data exists.
   */
  it("treats a warm snapshot as painted content, not an unfinished boot", () => {
    const painted = (isLoading: boolean, hasData: boolean) =>
      hasData && !shouldShowHomeSkeleton(isLoading, hasData)
    expect(painted(true, true)).toBe(true) // warm reopen, revalidating
    expect(painted(false, true)).toBe(true) // settled
    expect(painted(true, false)).toBe(false) // genuine cold start, still waiting
    expect(painted(false, false)).toBe(false) // error/empty — no content to show
  })
})
