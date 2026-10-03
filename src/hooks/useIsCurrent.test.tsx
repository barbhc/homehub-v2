/**
 * useIsCurrent — "is this answer still for what's on screen?" (H4).
 *
 * The check every late reply makes before it lands: true for the key the
 * component last rendered with, false for any other, and false for everything
 * once the component has unmounted.
 */
import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { useIsCurrent } from "./useIsCurrent"

describe("useIsCurrent", () => {
  it("is true for the key on screen and false for any other", () => {
    const { result } = renderHook(({ k }) => useIsCurrent(k), { initialProps: { k: "home-a" } })
    expect(result.current("home-a")).toBe(true)
    expect(result.current("home-b")).toBe(false)
  })

  it("a check held from before a switch answers for the key on screen NOW", () => {
    const { result, rerender } = renderHook(({ k }) => useIsCurrent(k), { initialProps: { k: "home-a" } })
    // What a read started for home A holds on to while its answer is in flight.
    const heldFromBefore = result.current
    rerender({ k: "home-b" })
    expect(heldFromBefore("home-a")).toBe(false)
    expect(heldFromBefore("home-b")).toBe(true)
    // Same function across renders, so it can sit in a dependency list.
    expect(result.current).toBe(heldFromBefore)
  })

  it("switching back makes the first key current again", () => {
    const { result, rerender } = renderHook(({ k }) => useIsCurrent(k), { initialProps: { k: "home-a" } })
    rerender({ k: "home-b" })
    rerender({ k: "home-a" })
    expect(result.current("home-a")).toBe(true)
  })

  it("nothing is current once the component has unmounted", () => {
    const { result, unmount } = renderHook(() => useIsCurrent("home-a"))
    const check = result.current
    unmount()
    expect(check("home-a")).toBe(false)
  })

  it("compares by value, so a composite string key works", () => {
    const { result, rerender } = renderHook(({ k }) => useIsCurrent(k), { initialProps: { k: "home-a/item-1" } })
    expect(result.current(`home-a/${"item-1"}`)).toBe(true)
    rerender({ k: "home-a/item-2" })
    expect(result.current("home-a/item-1")).toBe(false)
  })
})
