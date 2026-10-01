/**
 * "Not now" on the profile banner, when the dismissal fails to save (audit H6).
 *
 * The owner reported this banner coming back after she had dismissed it. The
 * dismissal moved to the server for that reason — and then the server write's
 * failure was swallowed, which is the same report waiting to happen. A failed
 * save now brings the banner back once, saying so, so "Not now" can be
 * pressed again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const dismissProfileBanner = vi.fn()
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/lib/userPreferences", () => ({
  dismissProfileBanner: (...a: unknown[]) => dismissProfileBanner(...a),
  getDismissedProfileBanners: async () => [],
}))

const { ProfileCompletionBanner } = await import("./ProfileCompletionBanner")

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  dismissProfileBanner.mockResolvedValue(undefined)
})

const renderBanner = () => render(<MemoryRouter><ProfileCompletionBanner homeId="home-1" /></MemoryRouter>)

describe("ProfileCompletionBanner — Not now", () => {
  it("a dismissal that fails to save brings the banner back and says so", async () => {
    dismissProfileBanner.mockRejectedValue(new Error("unavailable"))
    renderBanner()

    fireEvent.click(screen.getByRole("button", { name: "Not now" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that.")
    expect(screen.getByText("Finish your home profile")).toBeInTheDocument()
    // The local mirror does not claim a dismissal the server never got.
    expect(window.localStorage.getItem("homehub:profile_banner_dismissed:home-1")).toBeNull()
  })

  it("a dismissal that saves hides the banner for good (the control case)", async () => {
    renderBanner()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    await waitFor(() => expect(dismissProfileBanner).toHaveBeenCalledWith("uid-1", "home-1"))
    expect(screen.queryByText("Finish your home profile")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
