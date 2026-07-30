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
})
