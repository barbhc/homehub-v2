/**
 * Home with tasks but no items (D8, design/first-minute-onboarding.md, "Two
 * things the build must change outside onboarding", 2).
 *
 * Home treated a home as new when it had no ITEMS, and then showed only "Let's
 * set up your home" — so the tasks the first minute adds would have been
 * invisible. Found walking the real flow on the emulator, 2026-11-18.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const dash = vi.hoisted(() => ({ totalItems: 0, scheduledTaskCount: 2, upcoming: [] as unknown[] }))

// Home's In a pinch reads providers (design/home-next.md); none saved here.
vi.mock("@/hooks/useServiceProviders", () => ({ useServiceProviders: () => ({ providers: [], loading: false, loadFailed: false }) }))
vi.mock("@/modules/care", () => ({
  getHomeNotes: vi.fn(async () => ({ data: [], error: null })),
  markTaskInstanceDone: vi.fn(), snoozeTaskInstance: vi.fn(), unsnoozeTaskInstance: vi.fn(), previewNextDue: vi.fn(async () => null),
}))
vi.mock("@/lib/useDashboard", () => ({
  useDashboard: () => ({
    tasks: { overdue: [], dueSoon: [] },
    stats: { totalItems: dash.totalItems, scheduledTaskCount: dash.scheduledTaskCount, nextUp: null, completedThisMonth: 0 },
    upcoming: dash.upcoming, expiringWarranties: [], notices: { recalls: [], missingDetails: [] }, cleaningGuides: [],
    isLoading: false, error: undefined, refresh: async () => {},
  }),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "My home" }, homes: [], setCurrentHome: () => {}, refresh: async () => {} }),
  // An onboarding home has not answered the old profile questions — the banner must still not show.
  useHomeProfile: () => ({ profile: { completed_at: null, preferred_mode: null }, error: undefined }),
}))
vi.mock("@/integrations/firebase", () => ({ auth: { currentUser: null } }))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "essentials", derivedLevel: "essentials" }) }))
vi.mock("@/hooks/useFeatureTour", () => ({ useFeatureTour: () => ({ restartTour: () => {} }) }))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: null }) }))
vi.mock("@/components/dashboard/WhatsNewBanner", () => ({ WhatsNewBanner: () => null }))
vi.mock("@/components/dashboard/PushOptInNudge", () => ({ PushOptInNudge: () => <div data-testid="push-nudge" /> }))
vi.mock("@/components/dashboard/ProfileCompletionBanner", () => ({ ProfileCompletionBanner: () => <div data-testid="profile-banner" /> }))
vi.mock("@/components/home/HomeSwitcherSheet", () => ({ HomeSwitcherSheet: () => null }))
// The card's own states are NextStepCard.test.tsx's; here, only whether Home places it.
vi.mock("@/components/home/NextStepCard", () => ({
  NextStepCard: ({ totalItems }: { totalItems: number }) => <div data-testid="next-step-card" data-items={totalItems} />,
}))
vi.mock("@/components/home/tasks/shared", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTaskDetail: () => ({ detail: null, loading: false, error: null }),
}))

const { addDays, localToday } = await import("../../shared/dates/calendar")
const { default: Home } = await import("./Home")

/** The forward schedule's shape (useDashboard's `upcoming`): a home-level task due this weekend. */
const task = (id: string, title: string, priority: string) => ({
  id, title, next_due_date: addDays(localToday(), 2), itemName: null, item_id: null, priority, duePhrase: null, safetyNote: null,
})

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>)

beforeEach(() => {
  dash.totalItems = 0
  dash.scheduledTaskCount = 2
  dash.upcoming = [task("ti-1", "Test smoke and CO alarms", "critical"), task("ti-2", "Check the water heater's quake straps", "high")]
})

describe("Home — tasks before any item", () => {
  it("shows the week's first task as Next up, not the set-up hero; the rest are one tap away in Tasks", () => {
    renderHome()
    expect(screen.queryByText("Let's set up your home")).toBeNull()
    // Home, next (design/home-next.md): ONE task on Home; the week lives in Tasks.
    expect(screen.getAllByTestId("next-up-title")[0]).toHaveTextContent("Test smoke and CO alarms")
    expect(screen.queryByText("Check the water heater's quake straps")).toBeNull()
    expect(screen.getAllByRole("link", { name: /1 more this week/ })[0]).toHaveAttribute("href", "/maintenance")
  })

  it("offers one next step under the list (design/day-one-home.md)", () => {
    renderHome()
    const cards = screen.getAllByTestId("next-step-card")
    expect(cards.length).toBeGreaterThan(0) // phone and desktop trees; CSS shows one
    for (const c of cards) expect(c.getAttribute("data-items")).toBe("0")
  })

  it("the next step is the only one: no profile banner, no push nudge beside it", () => {
    renderHome()
    expect(screen.queryByTestId("profile-banner")).toBeNull()
    expect(screen.queryByTestId("push-nudge")).toBeNull()
  })

  it("a home with nothing at all is still new: the hero, and no label card", () => {
    dash.scheduledTaskCount = 0
    dash.upcoming = []
    renderHome()
    expect(screen.getByText("Let's set up your home")).toBeInTheDocument()
    expect(screen.queryByTestId("next-step-card")).toBeNull()
  })

  it("an early home keeps the card; three items retire it", () => {
    dash.totalItems = 2
    renderHome()
    expect(screen.getAllByTestId("next-step-card")[0].getAttribute("data-items")).toBe("2")
    cleanup()
    dash.totalItems = 3
    renderHome()
    expect(screen.queryByTestId("next-step-card")).toBeNull()
    expect(screen.queryByText("Let's set up your home")).toBeNull()
  })
})
