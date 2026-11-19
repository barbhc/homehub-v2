/**
 * The home's name under the greeting (owner, 2026-11-19): prime space, so it
 * shows only when it answers a question — which of your homes this is, or
 * whose home you joined. Adding a home moved to Settings → Homes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const dash = vi.hoisted(() => ({ totalItems: 0, scheduledTaskCount: 2, upcoming: [] as unknown[] }))

vi.mock("@/modules/care", () => ({
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
const homesState = vi.hoisted(() => ({ homes: [] as { home_id: string; name: string; created_by: string | null }[] }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: homesState.homes[0], homes: homesState.homes, setCurrentHome: () => {}, refresh: async () => {} }),
  // An onboarding home has not answered the old profile questions — the banner must still not show.
  useHomeProfile: () => ({ profile: { completed_at: null, preferred_mode: null }, error: undefined }),
}))
vi.mock("@/integrations/firebase", () => ({ auth: { currentUser: null } }))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "essentials", derivedLevel: "essentials" }) }))
vi.mock("@/hooks/useFeatureTour", () => ({ useFeatureTour: () => ({ restartTour: () => {} }) }))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: null }) }))
vi.mock("@/components/dashboard/WhatsNewBanner", () => ({ WhatsNewBanner: () => null }))
vi.mock("@/components/dashboard/LevelUnlockBanner", () => ({ LevelUnlockBanner: () => null }))
vi.mock("@/components/dashboard/PushOptInNudge", () => ({ PushOptInNudge: () => <div data-testid="push-nudge" /> }))
vi.mock("@/components/dashboard/ProfileCompletionBanner", () => ({ ProfileCompletionBanner: () => <div data-testid="profile-banner" /> }))
vi.mock("@/components/home/HomeSwitcherSheet", () => ({ HomeSwitcherSheet: () => null }))
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
const mine = (id: string, name: string) => ({ home_id: id, name, created_by: "uid-1" })

beforeEach(() => {
  dash.totalItems = 0
  dash.scheduledTaskCount = 2
  dash.upcoming = [task("ti-1", "Test smoke and CO alarms", "critical")]
})

describe("Home — the home's name under the greeting", () => {
  it("is hidden for a single home you created", () => {
    homesState.homes = [mine("h1", "Dallas house")]
    renderHome()
    expect(screen.queryByText("Dallas house")).toBeNull()
  })

  it("shows once you have a second home", () => {
    homesState.homes = [mine("h1", "Dallas house"), mine("h2", "Lake cabin")]
    renderHome()
    expect(screen.getByText("Dallas house")).toBeInTheDocument()
  })

  it("shows in a home someone else created, so you know whose it is", () => {
    homesState.homes = [{ home_id: "h1", name: "Mom's place", created_by: "uid-2" }]
    renderHome()
    expect(screen.getByText("Mom's place")).toBeInTheDocument()
  })

  it("shows for a legacy home with no owner on record — hidden only when we know it is yours", () => {
    homesState.homes = [{ home_id: "h1", name: "Old home", created_by: null }]
    renderHome()
    expect(screen.getByText("Old home")).toBeInTheDocument()
  })

  it("follows the same rule on a brand-new home's empty state", () => {
    dash.scheduledTaskCount = 0
    dash.upcoming = []
    homesState.homes = [mine("h1", "Dallas house")]
    renderHome()
    expect(screen.getByText("Let's set up your home")).toBeInTheDocument()
    expect(screen.queryByText("Dallas house")).toBeNull()
  })
})
