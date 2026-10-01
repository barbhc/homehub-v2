/**
 * Home's loading skeleton is the Home it turns into (design/home-focus.md):
 * one list, the first task open — not the retired Home's three-tile stat band
 * over two blocks, which every cold start used to show before landing on a
 * different page.
 */
import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { HomeSkeleton } from "./HomeSkeleton"

describe("HomeSkeleton — shaped like Home, focused", () => {
  it("draws one week list per layout, with the first row open and the rest closed", () => {
    render(<HomeSkeleton />)
    const lists = screen.getAllByTestId("home-skeleton-week")
    // Phone (RefinedHome) and desktop (DesktopHome) shapes; CSS shows one.
    expect(lists).toHaveLength(2)
    for (const list of lists) {
      const rows = list.querySelectorAll("[data-open]")
      expect([...rows].map((r) => r.getAttribute("data-open"))).toEqual(["true", "false", "false", "false"])
    }
  })

  it("draws no stat band — the retired Home's row of three tiles is not rendered at all", () => {
    const { container } = render(<HomeSkeleton />)
    expect(container.querySelector(".grid-cols-3")).toBeNull()
    expect(container.querySelectorAll(".grid")).toHaveLength(0)
  })

  it("says it is loading, and says so out loud once the wait stops being brief", () => {
    const { rerender } = render(<HomeSkeleton />)
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Loading your home…")
    expect(screen.queryByText(/Still setting up your home/)).toBeNull()

    rerender(<HomeSkeleton patienceExpired />)
    const phone = screen.getAllByRole("status")[0]
    expect(within(phone).getByText(/Still setting up your home/)).toBeInTheDocument()
  })
})
