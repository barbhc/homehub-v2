/**
 * Neither door into /sample is open while the page is being redesigned.
 *
 * Round 18, owner: the Inventory empty state's "See a sample home" button and
 * this screen's "Not sure yet? Look around a sample home first" both pointed at
 * a page still rendering the pre-round-18 layout. Showing someone a stale
 * version of the product — especially someone who has seen nothing else — is
 * worse than not offering it.
 *
 * The route survives and works by direct link. This is doors closed, not a page
 * retired: BACKLOG §4b parks the redesign until the add-item flow and the item
 * page are final, and both entry points come back with it.
 *
 * The test exists because a link is easy to restore by reflex when someone reads
 * the (still valid) argument for the escape hatch and does not know it was a
 * deliberate, temporary removal.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HomeOnboarding } from "./HomeOnboarding"

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))

describe("the onboarding screen", () => {
  it("does not link to the sample home", () => {
    render(<MemoryRouter><HomeOnboarding onComplete={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByRole("link", { name: /sample home/i })).toBeNull()
    expect(screen.queryByText(/Not sure yet/)).toBeNull()
  })

  it("still asks for the one thing it is for", () => {
    // Removing the escape hatch must not have taken the screen's job with it.
    render(<MemoryRouter><HomeOnboarding onComplete={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText(/Set up your home/)).toBeInTheDocument()
    expect(screen.getByText(/Give it a name/)).toBeInTheDocument()
  })
})
