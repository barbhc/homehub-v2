/**
 * Settings › Home profile: what it reads, and what a home switch does to it.
 *
 * The "Loading profile…" reset used to be setState inside the effect that
 * reads; H5 (the whole-app lint) makes it in the render that switches homes.
 * Pinned: the first read shows the spinner then the answers; switching homes
 * shows the spinner straight away — never the last home's answers — then the
 * new home's; a failed read says so.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const getHomeProfile = vi.hoisted(() => vi.fn())
vi.mock("@/modules/home", () => ({
  getHomeProfile: (...a: unknown[]) => getHomeProfile(...a),
  upsertHomeProfile: vi.fn(),
}))

const { HomeProfileSection } = await import("./HomeProfileSection")

const profile = (home_type: string) => ({
  home_type, ownership: null, ownership_duration: null, climate: null, top_concerns: [],
  preferred_mode: "unset", completed_at: null, updated_at: "2026-09-01T00:00:00Z",
})

/** The Home type select's trigger shows the chosen option. */
const homeType = () => screen.getByRole("combobox", { name: "Home type" })

describe("HomeProfileSection · reading the profile", () => {
  beforeEach(() => {
    getHomeProfile.mockReset()
    getHomeProfile.mockImplementation(async (homeId: string) => ({
      data: profile(homeId === "home-2" ? "condo" : "house"), error: null,
    }))
  })

  it("shows the spinner, then the answers", async () => {
    render(<HomeProfileSection homeId="home-1" />)
    expect(screen.getByText("Loading profile…")).toBeInTheDocument()
    await waitFor(() => expect(homeType()).toHaveTextContent("House"))
  })

  it("a home switch shows the spinner at once, then that home's answers", async () => {
    const { rerender } = render(<HomeProfileSection homeId="home-1" />)
    await waitFor(() => expect(homeType()).toHaveTextContent("House"))

    rerender(<HomeProfileSection homeId="home-2" />)
    expect(screen.getByText("Loading profile…")).toBeInTheDocument()
    await waitFor(() => expect(homeType()).toHaveTextContent("Condo"))
    expect(getHomeProfile).toHaveBeenLastCalledWith("home-2")
  })

  it("a failed read says why", async () => {
    getHomeProfile.mockResolvedValue({ data: null, error: { message: "Missing or insufficient permissions." } })
    render(<HomeProfileSection homeId="home-1" />)
    await waitFor(() => expect(screen.getByText("Missing or insufficient permissions.")).toBeInTheDocument())
  })
})
