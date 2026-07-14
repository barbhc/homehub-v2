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
  it("home=null → renders a placeholder (never blank) and redirects via effect", async () => {
    useCurrentHome.mockReturnValue({ home: null, loading: false, error: null, refresh: vi.fn() })
    const { container } = renderPage()
    // Never a blank render:
    expect(container.textContent).not.toBe("")
    await waitFor(() => expect(screen.getByText("INDEX-PAGE")).toBeInTheDocument())
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
