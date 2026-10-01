/**
 * Home's check-off and snooze, when the write fails (audit H6).
 *
 * Both handlers rolled the row back correctly — a task that did not complete
 * must not vanish — and then said nothing: `if (!result.success) return`. The
 * task sat there looking untouched, which reads as "my tap didn't register",
 * and the natural response is to tap again. Undoing a snooze failed the same
 * way, after the bar had already gone.
 *
 * Each case forces the service to fail and asserts the person SEES it, and
 * that nothing claims success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const care = vi.hoisted(() => ({
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  unsnoozeTaskInstance: vi.fn(),
}))
const refresh = vi.hoisted(() => vi.fn(async () => {}))

vi.mock("@/modules/care", () => ({
  markTaskInstanceDone: (...a: unknown[]) => care.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => care.snoozeTaskInstance(...a),
  unsnoozeTaskInstance: (...a: unknown[]) => care.unsnoozeTaskInstance(...a),
}))
vi.mock("@/lib/useDashboard", () => {
  const iso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
  const task = {
    id: "ti-1", name: "Replace the furnace filter", dueDate: iso(-6), isOverdue: true, isDueSoon: false,
    itemName: "Furnace", itemId: "i1", priority: "high", effort: null, daysOverdue: 6, daysUntilDue: null,
    dueKind: "window", windowState: "lapsed", duePhrase: "Been a while", safetyNote: null, trulyOverdue: false, neverStarted: false,
  }
  const data = {
    tasks: { overdue: [task], dueSoon: [] },
    stats: { totalItems: 3, scheduledTaskCount: 5, nextUp: null, completedThisMonth: 1 },
    upcoming: [],
    expiringWarranties: [],
    notices: { recalls: [], missingDetails: [] },
    cleaningGuides: [],
    isLoading: false,
    error: undefined,
  }
  return { useDashboard: () => ({ ...data, refresh }) }
})
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-1" } }) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" }, homes: [], setCurrentHome: () => {}, refresh: async () => {} }),
  useHomeProfile: () => ({ profile: { completed_at: "2026-01-01", preferred_mode: null }, error: undefined }),
}))
vi.mock("@/integrations/firebase", () => ({ auth: { currentUser: null } }))
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: "engaged", derivedLevel: "engaged" }) }))
vi.mock("@/hooks/useFeatureTour", () => ({ useFeatureTour: () => ({ restartTour: () => {} }) }))
vi.mock("@/hooks/useDisplayName", () => ({ useDisplayName: () => ({ firstName: null, fullName: null }) }))
vi.mock("@/components/dashboard/WhatsNewBanner", () => ({ WhatsNewBanner: () => null }))
vi.mock("@/components/dashboard/LevelUnlockBanner", () => ({ LevelUnlockBanner: () => null }))
vi.mock("@/components/dashboard/PushOptInNudge", () => ({ PushOptInNudge: () => null }))
vi.mock("@/components/home/HomeSwitcherSheet", () => ({ HomeSwitcherSheet: () => null }))
vi.mock("@/components/home/tasks/shared", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTaskDetail: () => ({ detail: null, loading: false, error: null }),
}))

const { default: Home } = await import("./Home")

const TITLE = "Replace the furnace filter"

beforeEach(() => {
  vi.clearAllMocks()
  care.markTaskInstanceDone.mockResolvedValue({ success: true, data: {} })
  care.snoozeTaskInstance.mockResolvedValue({ success: true, data: {} })
  care.unsnoozeTaskInstance.mockResolvedValue({ success: true, data: {} })
})

function renderHome() {
  render(<MemoryRouter><Home /></MemoryRouter>)
}

/** Phone (RefinedHome) and desktop (DesktopHome) lists are both in the DOM; CSS shows one. */
const firstRow = () => screen.getAllByTestId("week-row")[0]

describe("Home — a failed check-off or snooze is said on its row", () => {
  it("mark done fails → the row says so, the task stays, and nothing says 'Marked done'", async () => {
    care.markTaskInstanceDone.mockResolvedValue({ success: false, error: "INTERNAL" })
    renderHome()

    fireEvent.click(within(firstRow()).getByRole("button", { name: `Mark ${TITLE} done` }))

    expect(await within(firstRow()).findByRole("alert")).toHaveTextContent("Couldn't mark this done.")
    expect(within(firstRow()).getByText(TITLE)).toBeInTheDocument()
    expect(screen.queryByText("Marked done")).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("snooze fails → the row says so, the task stays, and nothing says 'Snoozed until'", async () => {
    care.snoozeTaskInstance.mockResolvedValue({ success: false, error: "permission-denied" })
    renderHome()

    // The first row is open by default; its body carries Snooze.
    fireEvent.click(within(firstRow()).getByRole("button", { name: /Snooze/ }))

    expect(await within(firstRow()).findByRole("alert")).toHaveTextContent("Couldn't snooze this.")
    expect(within(firstRow()).getByText(TITLE)).toBeInTheDocument()
    expect(screen.queryByText(/Snoozed until/)).toBeNull()
  })

  it("a failed undo of a snooze comes back to the bar with Undo — it used to vanish", async () => {
    care.unsnoozeTaskInstance.mockResolvedValueOnce({ success: false, error: "unavailable" })
    renderHome()

    fireEvent.click(within(firstRow()).getByRole("button", { name: /Snooze/ }))
    expect(await screen.findByText(/Snoozed until/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(await screen.findByText("Couldn't undo the snooze. Try again.")).toBeInTheDocument()

    // The retry is the same Undo, and this time it lands.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(care.unsnoozeTaskInstance).toHaveBeenCalledTimes(2))
    expect(care.unsnoozeTaskInstance).toHaveBeenLastCalledWith("home-1", "ti-1")
  })

  it("mark done SUCCEEDS → no alert, and the receipt says so (the control case)", async () => {
    renderHome()
    fireEvent.click(within(firstRow()).getByRole("button", { name: `Mark ${TITLE} done` }))
    expect(await screen.findByText("Marked done")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
