/**
 * useDepsChanged — the render-phase replacement for "reset state in an effect
 * when a prop changes" (H5, the whole-app lint).
 *
 * The contract the call sites rely on: it reports a change on exactly the
 * render whose deps differ from the last one (Object.is, like an effect), and
 * a reset written with it is never COMMITTED with the stale state — the frame
 * the effect version briefly painted.
 */
import { describe, it, expect } from "vitest"
import { useLayoutEffect, useState } from "react"
import { render } from "@testing-library/react"
import { useDepsChanged } from "./useDepsChanged"

function Probe({ onMount, seen }: { onMount?: boolean; seen: boolean[] }) {
  seen.push(useDepsChanged([1], { onMount }))
  return null
}

describe("useDepsChanged", () => {
  it("is false on mount by default, and true on mount with onMount (an effect's mount run)", () => {
    const quiet: boolean[] = []
    render(<Probe seen={quiet} />)
    expect(quiet).toEqual([false])

    const mounted: boolean[] = []
    render(<Probe onMount seen={mounted} />)
    // Reported once, on the first render; the render that follows (the one
    // React commits) sees no change, so it settles instead of looping.
    expect(mounted).toEqual([true, false])
  })

  it("reports a change only when a dep differs (Object.is), and only once", () => {
    let calls = 0
    function Counter({ a, b }: { a: unknown; b: unknown }) {
      if (useDepsChanged([a, b])) calls++
      return null
    }
    const { rerender } = render(<Counter a={1} b="x" />)
    expect(calls).toBe(0)
    rerender(<Counter a={1} b="x" />)
    expect(calls).toBe(0)
    rerender(<Counter a={2} b="x" />)
    expect(calls).toBe(1)
    rerender(<Counter a={2} b="x" />)
    expect(calls).toBe(1)
    // NaN is equal to itself, as in an effect's dependency check.
    rerender(<Counter a={NaN} b="x" />)
    rerender(<Counter a={NaN} b="x" />)
    expect(calls).toBe(2)
  })

  it("a reset written with it never commits the stale state", () => {
    const committed: string[] = []
    function Sheet({ open, page }: { open: boolean; page: number }) {
      const [shown, setShown] = useState(page)
      if (useDepsChanged([open, page]) && open) setShown(page)
      useLayoutEffect(() => {
        committed.push(`${open}:${page}:${shown}`)
      })
      return null
    }
    const { rerender } = render(<Sheet open={false} page={1} />)
    rerender(<Sheet open page={7} />)
    rerender(<Sheet open page={9} />)
    // Every committed frame shows the page it was asked for — never "open:7:1".
    expect(committed).toEqual(["false:1:1", "true:7:7", "true:9:9"])
  })
})
