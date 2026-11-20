/**
 * Skeleton → content: content fades in ONLY when it replaces a skeleton the
 * user actually saw. A warm render (content on the first frame — the persisted
 * snapshot, while SWR still reports isLoading) must not fade.
 */
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { fadeAfterSkeleton, useFadeAfterSkeleton } from "./useFadeAfterSkeleton"

function Probe({ skeleton, seen }: { skeleton: boolean; seen: boolean[] }) {
  seen.push(useFadeAfterSkeleton(skeleton))
  return null
}

/** The value React COMMITTED for each prop change (the last render of each). */
function committed(sequence: boolean[]) {
  const seen: boolean[] = []
  const out: boolean[] = []
  const { rerender } = render(<Probe skeleton={sequence[0]} seen={seen} />)
  out.push(seen[seen.length - 1])
  for (const s of sequence.slice(1)) {
    rerender(<Probe skeleton={s} seen={seen} />)
    out.push(seen[seen.length - 1])
  }
  return out
}

describe("useFadeAfterSkeleton", () => {
  it("a warm render — content from the first frame — never fades", () => {
    expect(committed([false, false, false])).toEqual([false, false, false])
  })

  it("content that replaces a skeleton fades in", () => {
    expect(committed([true, false])).toEqual([false, true])
  })

  it("a skeleton that appears later (a home switch with no cache) makes the next content fade too", () => {
    expect(committed([false, true, false])).toEqual([false, false, true])
  })

  it("never fades while the skeleton itself is up", () => {
    expect(committed([true, true])).toEqual([false, false])
  })

  it("the rule, pure", () => {
    expect(fadeAfterSkeleton(false, false)).toBe(false)
    expect(fadeAfterSkeleton(true, false)).toBe(true)
    expect(fadeAfterSkeleton(true, true)).toBe(false)
  })
})
