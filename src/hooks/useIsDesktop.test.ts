/**
 * useIsDesktop decides which ONE tree the item page renders. It has to agree
 * with Tailwind's `lg` at the start, and it has to follow the window across the
 * line — an iPad rotating, a laptop window being narrowed — or the page keeps
 * rendering the layout for a width it no longer has.
 */
import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { DESKTOP_MEDIA_QUERY, useIsDesktop } from "./useIsDesktop"
import { activeTestMediaListeners, evaluateTestMediaQuery, setTestViewportWidth } from "@/test/matchMedia"

describe("useIsDesktop", () => {
  it("is false on a phone", () => {
    setTestViewportWidth(390)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
  })

  it("is true at a desktop width", () => {
    setTestViewportWidth(1440)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
  })

  it("flips when the window crosses the breakpoint, both ways", () => {
    setTestViewportWidth(390)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)

    act(() => setTestViewportWidth(1280))
    expect(result.current).toBe(true)

    act(() => setTestViewportWidth(800))
    expect(result.current).toBe(false)
  })

  it("stops listening once unmounted", () => {
    setTestViewportWidth(390)
    const before = activeTestMediaListeners()
    const { unmount } = renderHook(() => useIsDesktop())
    expect(activeTestMediaListeners()).toBeGreaterThan(before)
    unmount()
    // A leaked listener per mount is how a page that is visited often ends up
    // re-rendering things nobody is looking at.
    expect(activeTestMediaListeners()).toBe(before)
  })

  it("draws the line exactly where Tailwind's lg does (64rem = 1024px)", () => {
    expect(DESKTOP_MEDIA_QUERY).toBe("(min-width: 64rem)")
    expect(evaluateTestMediaQuery(DESKTOP_MEDIA_QUERY, 1023)).toBe(false)
    expect(evaluateTestMediaQuery(DESKTOP_MEDIA_QUERY, 1024)).toBe(true)
  })

  it("answers the phone layout when there is no matchMedia at all", () => {
    const original = window.matchMedia
    // Older WebViews and non-browser renders: the guard, not a throw.
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: undefined })
    try {
      const { result } = renderHook(() => useIsDesktop())
      expect(result.current).toBe(false)
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: original })
    }
  })
})
