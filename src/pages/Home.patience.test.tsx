/**
 * Home's skeleton patience: shimmer for SKELETON_PATIENCE_MS, then say so — and
 * a LATER skeleton (a home switch, a reload with no cache) starts its patience
 * over instead of opening on "Still setting up".
 *
 * The reset on leaving the skeleton used to be setState in an effect; H5 (the
 * whole-app lint) moved it into the render that leaves (useDepsChanged). This
 * pins the sequence the person sees either way.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const dash = vi.hoisted(() => ({ isLoading: true, hasStats: false }))

vi.mock("@/lib/useDashboard", () => ({
  useDashboard: () => ({
    tasks: dash.hasStats ? { overdue: [], dueSoon: [] } : undefined,
    stats: dash.hasStats ? { totalItems: 3, scheduledTaskCount: 5, nextUp: null, completedThisMonth: 0 } : undefined,
    upcoming: [],
    expiringWarranties: [],
    notices: { recalls: [], missingDetails: [] },
    cleaningGuides: [],
    isLoading: dash.isLoading,
    error: undefined,
    refresh: async () => {},
  }),
}))
vi.mock("@/modules/care", () => ({
  markTaskInstanceDone: vi.fn(), snoozeTaskInstance: vi.fn(), unsnoozeTaskInstance: vi.fn(),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" }, homes: [], setCurrentHome: () => {}, refresh: async () => {} }),
  useHomeProfile: () => ({ profile: { completed_at: "2026-01-01", preferred_mode: null }, error: undefined }),
}))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "engaged", derivedLevel: "engaged" }) }))
vi.mock("@/hooks/useFeatureTour", () => ({ useFeatureTour: () => ({ restartTour: () => {} }) }))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: null }) }))
vi.mock("@/components/dashboard/WhatsNewBanner", () => ({ WhatsNewBanner: () => null }))
vi.mock("@/components/dashboard/LevelUnlockBanner", () => ({ LevelUnlockBanner: () => null }))
vi.mock("@/components/dashboard/PushOptInNudge", () => ({ PushOptInNudge: () => null }))
vi.mock("@/components/home/HomeSwitcherSheet", () => ({ HomeSwitcherSheet: () => null }))
vi.mock("@/components/home/RefinedHome", () => ({ RefinedHome: () => <p>Home content</p> }))
vi.mock("@/components/home/DesktopHome", () => ({ DesktopHome: () => null }))

const { default: Home } = await import("./Home")
const { SKELETON_PATIENCE_MS } = await import("@/lib/homeLoadingGate")

const page = () => (
  <MemoryRouter>
    <Home />
  </MemoryRouter>
)
const slow = () => screen.queryAllByText(/Still setting up your home/).length > 0

describe("Home · skeleton patience", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    dash.isLoading = true
    dash.hasStats = false
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("says so after the patience runs out, and a later skeleton starts over", () => {
    const { rerender } = render(page())
    expect(screen.getAllByText("Loading your home…").length).toBeGreaterThan(0)
    expect(slow()).toBe(false)

    act(() => { vi.advanceTimersByTime(SKELETON_PATIENCE_MS + 1) })
    expect(slow()).toBe(true)

    // The dashboard lands: content, no skeleton.
    dash.isLoading = false
    dash.hasStats = true
    rerender(page())
    expect(screen.getByText("Home content")).toBeInTheDocument()

    // A later skeleton (nothing to paint again) opens patient, not "slow".
    dash.isLoading = true
    dash.hasStats = false
    rerender(page())
    expect(screen.getAllByText("Loading your home…").length).toBeGreaterThan(0)
    expect(slow()).toBe(false)

    act(() => { vi.advanceTimersByTime(SKELETON_PATIENCE_MS + 1) })
    expect(slow()).toBe(true)
  })
})
