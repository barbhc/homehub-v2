/**
 * Scroll-edge hairline: absent at rest, present once content has scrolled
 * beneath the sticky header — decided by an IntersectionObserver on a sentinel,
 * never a scroll listener.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"
import { scrolledPast } from "./useScrollEdge"
import { StickyHeader } from "@/components/layout/StickyHeader"

type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void
let observers: { cb: Cb; options?: IntersectionObserverInit }[] = []

beforeEach(() => {
  observers = []
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: Cb, options?: IntersectionObserverInit) {
        observers.push({ cb, options })
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRectReadOnly

describe("scroll edge", () => {
  it("the rule: scrolled only when the sentinel has gone ABOVE the line", () => {
    expect(scrolledPast({ isIntersecting: true, boundingClientRect: rect(10, 11), rootBounds: rect(0, 800) })).toBe(false)
    expect(scrolledPast({ isIntersecting: false, boundingClientRect: rect(-40, -39), rootBounds: rect(0, 800) })).toBe(true)
    // Out of view BELOW the fold is not scrolled.
    expect(scrolledPast({ isIntersecting: false, boundingClientRect: rect(900, 901), rootBounds: rect(0, 800) })).toBe(false)
  })

  it("StickyHeader draws no hairline at rest, then one once content passes under it", () => {
    const { getByTestId } = render(<StickyHeader data-testid="hdr">Tabs</StickyHeader>)
    const hdr = getByTestId("hdr")
    expect(hdr).not.toHaveAttribute("data-scrolled")
    expect(hdr.className).toContain("hh-scroll-edge")
    expect(hdr.style.top).toBe("0px")
    expect(observers).toHaveLength(1)

    act(() => observers[0].cb([{ isIntersecting: false, boundingClientRect: rect(-5, -4), rootBounds: rect(0, 800) }]))
    expect(hdr).toHaveAttribute("data-scrolled")

    act(() => observers[0].cb([{ isIntersecting: true, boundingClientRect: rect(2, 3), rootBounds: rect(0, 800) }]))
    expect(hdr).not.toHaveAttribute("data-scrolled")
  })

  it("watches the line where the header sticks (its `top`)", () => {
    render(<StickyHeader top={44}>Tabs</StickyHeader>)
    expect(observers[0].options?.rootMargin).toBe("-44px 0px 0px 0px")
  })
})
