/**
 * The level-unlock notice: shown once when the derived level rises past the
 * highest one seen on this device, dismissed for good by recording it.
 *
 * The check used to be setState in an effect; H5 (the whole-app lint) makes it
 * in the render that brings the level (useDepsChanged, with the mount run).
 * Pinned: shown on arrival for a new level, not for a level already seen, shown
 * when the level rises later, and gone — and remembered — once dismissed.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { LevelUnlockBanner } from "./LevelUnlockBanner"

const SEEN_KEY = "homehub:level-seen"
const notice = () => screen.queryByText("New features unlocked")

describe("LevelUnlockBanner", () => {
  beforeEach(() => localStorage.clear())

  it("shows on arrival for a level above the one seen", () => {
    render(<LevelUnlockBanner derivedLevel="engaged" />)
    expect(notice()).toBeInTheDocument()
  })

  it("stays quiet for a level already seen, and for no level", () => {
    localStorage.setItem(SEEN_KEY, "engaged")
    const { rerender } = render(<LevelUnlockBanner derivedLevel="engaged" />)
    expect(notice()).toBeNull()
    rerender(<LevelUnlockBanner derivedLevel={null} />)
    expect(notice()).toBeNull()
  })

  it("shows when the level rises later, and dismissing it records the level", () => {
    localStorage.setItem(SEEN_KEY, "engaged")
    const { rerender } = render(<LevelUnlockBanner derivedLevel="engaged" />)
    expect(notice()).toBeNull()

    rerender(<LevelUnlockBanner derivedLevel="power" />)
    expect(notice()).toBeInTheDocument()
    expect(screen.getByText(/power user/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(notice()).toBeNull()
    expect(localStorage.getItem(SEEN_KEY)).toBe("power")
  })
})
