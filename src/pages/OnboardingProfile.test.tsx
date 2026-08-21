/**
 * OnboardingProfile redirect regression: with home=null the old code called
 * navigate() during render and returned null — react-router refuses render-phase
 * navigation, so the page went permanently BLANK (the launch incident's symptom).
 * Now the redirect lives in an effect and a loading placeholder renders.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import OnboardingProfile from "./OnboardingProfile"

const useCurrentHome = vi.fn()
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => useCurrentHome(),
  HomeProfileOnboarding: ({ homeId }: { homeId: string }) => <div>PROFILE-QA:{homeId}</div>,
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/onboarding/profile"]}>
      <Routes>
        <Route path="/onboarding/profile" element={<OnboardingProfile />} />
        <Route path="/" element={<div>INDEX-PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("OnboardingProfile", () => {
  it("home=null → placeholder, then redirect only AFTER the grace window", async () => {
    useCurrentHome.mockReturnValue({ home: null, loading: false, error: null, refresh: vi.fn() })
    const { container } = renderPage()
    // Never a blank render:
    expect(container.textContent).not.toBe("")
    // No instant bounce: the provider's setHome for a just-created home can
    // land a tick after mount, and the old immediate redirect skipped the
    // profile step (and the first-item funnel) for every new account.
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.queryByText("INDEX-PAGE")).not.toBeInTheDocument()
    // A user with truly no home still gets redirected once the grace lapses.
    await waitFor(() => expect(screen.getByText("INDEX-PAGE")).toBeInTheDocument(), { timeout: 3_000 })
  })

  it("home arriving within the grace cancels the redirect", async () => {
    useCurrentHome.mockReturnValue({ home: null, loading: false, error: null, refresh: vi.fn() })
    const { rerender } = renderPage()
    await new Promise((r) => setTimeout(r, 300))
    useCurrentHome.mockReturnValue({
      home: { home_id: "h1", name: "SF Condo", timezone: "", created_at: "", updated_at: "", deleted_at: null },
      loading: false,
      error: null,
      refresh: vi.fn(),
    })
    rerender(
      <MemoryRouter initialEntries={["/onboarding/profile"]}>
        <Routes>
          <Route path="/onboarding/profile" element={<OnboardingProfile />} />
          <Route path="/" element={<div>INDEX-PAGE</div>} />
        </Routes>
      </MemoryRouter>
    )
    await new Promise((r) => setTimeout(r, 2_000))
    expect(screen.queryByText("INDEX-PAGE")).not.toBeInTheDocument()
    expect(screen.getByText("PROFILE-QA:h1")).toBeInTheDocument()
  })

  it("with a home → renders the profile Q&A", () => {
    useCurrentHome.mockReturnValue({
      home: { home_id: "h1", name: "SF Condo", timezone: "", created_at: "", updated_at: "", deleted_at: null },
      loading: false,
      error: null,
      refresh: vi.fn(),
    })
    renderPage()
    expect(screen.getByText("PROFILE-QA:h1")).toBeInTheDocument()
  })
})
