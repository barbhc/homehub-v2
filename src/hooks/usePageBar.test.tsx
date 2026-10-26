/**
 * usePageBar is how the tray pill and the UndoBar learn that a page has its
 * own bar at the bottom of the screen (Mark done, the Deep Clean footer) and
 * stand above it. The variable must appear while the bar is mounted and be
 * gone after — a stale value would float the pill on every later page.
 */
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { PAGE_BAR_VAR, usePageBar } from "./usePageBar"

function Bar({ show }: { show: boolean }) {
  const ref = usePageBar()
  return show ? <div ref={ref}>bar</div> : null
}

describe("usePageBar", () => {
  it("publishes the bar's height on <html> while mounted and clears it after", () => {
    const root = document.documentElement
    const { rerender, unmount } = render(<Bar show />)
    // jsdom lays nothing out, so the height is 0 — what matters is that the
    // variable is SET (to a px length) while the bar exists.
    expect(root.style.getPropertyValue(PAGE_BAR_VAR)).toBe("0px")

    rerender(<Bar show={false} />)
    expect(root.style.getPropertyValue(PAGE_BAR_VAR)).toBe("")

    rerender(<Bar show />)
    expect(root.style.getPropertyValue(PAGE_BAR_VAR)).toBe("0px")
    unmount()
    expect(root.style.getPropertyValue(PAGE_BAR_VAR)).toBe("")
  })
})
