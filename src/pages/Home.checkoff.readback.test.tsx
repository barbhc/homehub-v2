/**
 * Home's Mark done when the completion LANDS but reading it back fails
 * (audit H6 follow-up) — through the REAL markTaskInstanceDone.
 *
 * The read-back sat outside the service's try, so it rejected after a
 * successful completeTask; Home's handler has no catch (the service promises
 * never to throw), so `completingId` stayed set — the row dimmed for good,
 * no "Marked done", no error — for a task that was done. It must read as
 * done: the receipt shows and the row leaves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const fb = vi.hoisted(() => ({ complete: vi.fn(), getDoc: vi.fn() }))
const refresh = vi.hoisted(() => vi.fn(async () => {}))

vi.mock("@/integrations/firebase", () => ({
  auth: { currentUser: null },
  db: {},
  callable: (name: string) => (data: unknown) => (name === "completeTask" ? fb.complete(data) : Promise.reject(new Error(`unexpected ${name}`))),
}))
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: vi.fn(() => ({})),
  getDoc: (...a: unknown[]) => fb.getDoc(...a),
}))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
// The real check-off service; the rest of the module is not on this path.
vi.mock("@/modules/care", async () => {
  const ts = await vi.importActual<typeof import("@/modules/care/services/taskService")>("@/modules/care/services/taskService")
  return { markTaskInstanceDone: ts.markTaskInstanceDone, snoozeTaskInstance: vi.fn(), unsnoozeTaskInstance: vi.fn() }
})
vi.mock("@/lib/useDashboard", async () => {
  const { addDays, localToday } = await import("../../shared/dates/calendar")
  const iso = (days: number) => addDays(localToday(), days)
  const task = {
    id: "ti-1", name: "Replace the furnace filter", dueDate: iso(-6), isOverdue: true, isDueSoon: false,
    itemName: "Furnace", itemId: "i1", priority: "high", effort: null, daysOverdue: 6, daysUntilDue: null,
    dueKind: "window", windowState: "lapsed", duePhrase: "Been a while", safetyNote: null, trulyOverdue: false, neverStarted: false,
  }
  const data = {
    tasks: { overdue: [task], dueSoon: [] },
    stats: { totalItems: 3, scheduledTaskCount: 5, nextUp: null, completedThisMonth: 1 },
    upcoming: [], expiringWarranties: [], notices: { recalls: [], missingDetails: [] }, cleaningGuides: [],
    isLoading: false, error: undefined,
  }
  return { useDashboard: () => ({ ...data, refresh }) }
})
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
vi.mock("@/components/home/tasks/shared", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTaskDetail: () => ({ detail: null, loading: false, error: null }),
}))

const { default: Home } = await import("./Home")

const TITLE = "Replace the furnace filter"

beforeEach(() => {
  vi.clearAllMocks()
  fb.complete.mockResolvedValue({ completedInstanceId: "ti-1", nextInstanceId: "ti-2" })
})

describe("Home — a completion that landed reads as done, even if its read-back fails", () => {
  it("shows the receipt, refetches, and leaves nothing stuck or alarming", async () => {
    fb.getDoc.mockRejectedValue(new Error("Failed to get document because the client is offline."))
    render(<MemoryRouter><Home /></MemoryRouter>)

    const row = screen.getAllByTestId("week-row")[0]
    fireEvent.click(within(row).getByRole("button", { name: `Mark ${TITLE} done` }))

    expect(await screen.findByText("Marked done")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(fb.complete).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    // Not stuck on "completing": this static dashboard still lists the task
    // after the (mocked) refetch, and its Mark done is live again — where the
    // old rejection left it disabled for good.
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: `Mark ${TITLE} done` })
      expect(buttons.length).toBeGreaterThan(0)
      for (const b of buttons) expect(b).toBeEnabled()
    })
  })
})
