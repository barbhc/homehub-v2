/**
 * The sample home must never be a room with no door.
 *
 * Owner, pair-QA on the preview: "I don't know how to get back to the home
 * page." She was right, and the reason is structural: `/sample` renders outside
 * AppLayout — deliberately, because it has to work before you have a home — so
 * it has no bottom nav, and the only link on the page was "Set up your own
 * home" at the very bottom, about two screens down.
 *
 * That link is a commitment, not an exit. Someone who arrived from their own
 * Inventory to look around had nothing to press. In a browser, back exists; in
 * the Capacitor shell there is no browser chrome, so there was no visible exit
 * at all.
 *
 * HH-108 was this same shape on a different screen: "I can't exit out of this
 * window once I open up this Preview."
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import SampleHome from "./SampleHome"

const navigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}))

const renderPage = () => render(<MemoryRouter><SampleHome /></MemoryRouter>)

describe("the way out", () => {
  beforeEach(() => navigate.mockClear())

  it("offers a Back control without scrolling", () => {
    renderPage()
    expect(screen.getByRole("button", { name: /^Back$/ })).toBeInTheDocument()
  })

  it("returns you where you came from", () => {
    // Both doors — the Inventory empty state and onboarding — are one pop away.
    vi.spyOn(window.history, "length", "get").mockReturnValue(3)
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }))
    expect(navigate).toHaveBeenCalledWith(-1)
  })

  it("goes to the app root when there is no history to pop", () => {
    // A cold link has nothing behind it. A back button that does nothing is the
    // original bug with an extra step.
    vi.spyOn(window.history, "length", "get").mockReturnValue(1)
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }))
    expect(navigate).toHaveBeenCalledWith("/")
  })

  it("keeps the commitment link too — it is not the same affordance", () => {
    // "Set up your own home" is the conversion, and it stays at the bottom where
    // it belongs. The bug was that it was the ONLY thing there.
    renderPage()
    expect(screen.getByRole("link", { name: /Set up your own home/ })).toBeInTheDocument()
  })
})
