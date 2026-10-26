/**
 * useKeyboardInset is how the Ask composer stays above the iOS keyboard: in
 * WKWebView the keyboard shrinks only the visual viewport, so the page has to
 * measure the overlap itself. These pin the arithmetic, the event wiring, and
 * the two "do nothing" cases (no visualViewport; a pinch zoom).
 */
import { afterEach, describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { keyboardOverlap, keyboardPadding, useKeyboardInset, useKeyboardPadding } from "./useKeyboardInset"

class FakeViewport extends EventTarget {
  height: number
  offsetTop = 0
  scale = 1
  listeners = 0
  constructor(height: number) {
    super()
    this.height = height
  }
  addEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
    this.listeners++
    super.addEventListener(...args)
  }
  removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) {
    this.listeners--
    super.removeEventListener(...args)
  }
  /** What the browser does when the keyboard opens or closes. */
  set(height: number, offsetTop = 0) {
    this.height = height
    this.offsetTop = offsetTop
    this.dispatchEvent(new Event("resize"))
  }
}

const original = Object.getOwnPropertyDescriptor(window, "visualViewport")
function install(vv: FakeViewport | null) {
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv })
}
afterEach(() => {
  if (original) Object.defineProperty(window, "visualViewport", original)
  else delete (window as { visualViewport?: unknown }).visualViewport
})

describe("keyboardOverlap", () => {
  it("is the part of the layout viewport below the visual one", () => {
    expect(keyboardOverlap(844, { height: 508, offsetTop: 0 })).toBe(336)
  })

  it("subtracts how far the visual viewport has scrolled down", () => {
    // iOS scrolls the visual viewport to reveal the focused field; that part
    // of the layout viewport is above the keyboard, not under it.
    expect(keyboardOverlap(844, { height: 508, offsetTop: 100 })).toBe(236)
  })

  it("never goes negative and rounds sub-pixel heights", () => {
    expect(keyboardOverlap(844, { height: 900, offsetTop: 0 })).toBe(0)
    expect(keyboardOverlap(844, { height: 507.6, offsetTop: 0 })).toBe(336)
  })

  it("is 0 without a visualViewport", () => {
    expect(keyboardOverlap(844, null)).toBe(0)
    expect(keyboardOverlap(844, undefined)).toBe(0)
  })

  it("is 0 while pinch-zoomed — the reader zooming is not a keyboard", () => {
    expect(keyboardOverlap(844, { height: 422, offsetTop: 0, scale: 2 })).toBe(0)
  })
})

describe("useKeyboardInset", () => {
  it("follows the keyboard opening and closing", () => {
    const vv = new FakeViewport(window.innerHeight)
    install(vv)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)

    act(() => vv.set(window.innerHeight - 336))
    expect(result.current).toBe(336)

    act(() => vv.set(window.innerHeight - 336, 36))
    expect(result.current).toBe(300)

    act(() => vv.set(window.innerHeight))
    expect(result.current).toBe(0)
  })

  it("updates on the visual viewport's scroll, not only its resize", () => {
    const vv = new FakeViewport(window.innerHeight - 336)
    install(vv)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(336)
    act(() => {
      vv.offsetTop = 136
      vv.dispatchEvent(new Event("scroll"))
    })
    expect(result.current).toBe(200)
  })

  it("is a no-op where visualViewport does not exist", () => {
    install(null)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
    act(() => window.dispatchEvent(new Event("resize")))
    expect(result.current).toBe(0)
  })

  it("stops listening once unmounted", () => {
    const vv = new FakeViewport(window.innerHeight)
    install(vv)
    const { unmount } = renderHook(() => useKeyboardInset())
    expect(vv.listeners).toBeGreaterThan(0)
    unmount()
    expect(vv.listeners).toBe(0)
  })
})

describe("keyboardPadding", () => {
  // 390×844 phone, 336px keyboard: its top edge is at 508.
  it("is the overlap when the container ends at the viewport's bottom", () => {
    expect(keyboardPadding(336, 844, 844)).toBe(336)
  })

  it("absorbs a container that ends short of the screen (Ask's 48px below md)", () => {
    // Container bottom 796: padding 288 puts its content's end at 508.
    expect(keyboardPadding(336, 844, 796)).toBe(288)
    expect(796 - keyboardPadding(336, 844, 796)).toBe(844 - 336)
  })

  it("absorbs the window scrolling the container up to reveal the field", () => {
    // WebKit scrolled the window 25px: the container now ends at 771.
    expect(keyboardPadding(336, 844, 771)).toBe(263)
    expect(771 - keyboardPadding(336, 844, 771)).toBe(844 - 336)
  })

  it("is 0 when the container already ends above the keyboard, and rounds", () => {
    expect(keyboardPadding(336, 844, 400)).toBe(0)
    expect(keyboardPadding(336, 844, 795.6)).toBe(288)
  })
})

describe("useKeyboardPadding", () => {
  function containerEndingAt(bottom: () => number) {
    const el = document.createElement("div")
    el.getBoundingClientRect = () => ({ bottom: bottom() } as DOMRect)
    return { current: el }
  }

  it("follows the keyboard and the window scroll; 0 while the keyboard is closed", () => {
    const vv = new FakeViewport(window.innerHeight)
    install(vv)
    let bottom = window.innerHeight - 48
    const ref = containerEndingAt(() => bottom)
    const { result } = renderHook(() => useKeyboardPadding(ref))
    expect(result.current).toBe(0)

    act(() => vv.set(window.innerHeight - 336))
    expect(result.current).toBe(336 - 48)

    act(() => {
      bottom -= 25
      window.dispatchEvent(new Event("scroll"))
    })
    expect(result.current).toBe(336 - 48 - 25)

    act(() => vv.set(window.innerHeight))
    expect(result.current).toBe(0)
  })

  it("is 0 where visualViewport does not exist", () => {
    install(null)
    const ref = containerEndingAt(() => 0)
    const { result } = renderHook(() => useKeyboardPadding(ref))
    expect(result.current).toBe(0)
  })
})
