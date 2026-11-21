/**
 * The reminder ask (design/day-one-home.md, release C) is offered only after
 * a Done is SAVED — never on the tap, never after a failed or undone one —
 * and carries what the sheet needs: the task, whether it is Essential, its
 * item, and the next date the receipt named.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const care = vi.hoisted(() => ({
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  unsnoozeTaskInstance: vi.fn(),
  previewNextDue: vi.fn(),
}))
const refresh = vi.hoisted(() => vi.fn(async () => {}))
const dash = vi.hoisted(() => ({ priority: "critical" }))
const offer = vi.hoisted(() => vi.fn(async () => {}))

vi.mock("@/modules/care", () => ({
  markTaskInstanceDone: (...a: unknown[]) => care.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => care.snoozeTaskInstance(...a),
  unsnoozeTaskInstance: (...a: unknown[]) => care.unsnoozeTaskInstance(...a),
  previewNextDue: (...a: unknown[]) => care.previewNextDue(...a),
}))
vi.mock("@/lib/useDashboard", async () => {
  const { addDays, localToday } = await import("../../shared/dates/calendar")
  const iso = (days: number) => addDays(localToday(), days)
  const task = {
    id: "ti-1", name: "Replace the furnace filter", dueDate: iso(-6), isOverdue: true, isDueSoon: false,
    itemName: "Furnace", itemId: "i1", priority: dash.priority, effort: null, daysOverdue: 6, daysUntilDue: null,
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
  return { useDashboard: () => ({ ...data, tasks: { overdue: [{ ...task, priority: dash.priority }], dueSoon: [] }, refresh }) }
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
vi.mock("@/components/dashboard/PushOptInNudge", () => ({ PushOptInNudge: () => null }))
vi.mock("@/components/home/HomeSwitcherSheet", () => ({ HomeSwitcherSheet: () => null }))
vi.mock("@/hooks/useReminderAsk", () => ({ useReminderAsk: () => ({ offer, sheet: null }) }))
vi.mock("@/components/home/tasks/shared", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTaskDetail: () => ({ detail: null, loading: false, error: null }),
}))

const { default: Home } = await import("./Home")

const TITLE = "Replace the furnace filter"

/** A Done from a list is written when its Undo bar goes; closing the bar writes it now. */
const acceptDone = async () => {
  const close = within(await screen.findByRole("status")).getByRole("button", { name: "Dismiss" })
  await act(async () => {
    fireEvent.click(close)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  care.markTaskInstanceDone.mockResolvedValue({ success: true, data: {} })
  care.snoozeTaskInstance.mockResolvedValue({ success: true, data: {} })
  care.unsnoozeTaskInstance.mockResolvedValue({ success: true, data: {} })
  care.previewNextDue.mockResolvedValue(null)
})

function renderHome() {
  render(<MemoryRouter><Home /></MemoryRouter>)
}

/** Phone (RefinedHome) and desktop (DesktopHome) lists are both in the DOM; CSS shows one. */
const firstRow = () => screen.getAllByTestId("week-row")[0]

beforeEach(() => {
  dash.priority = "critical"
})

describe("Home — the reminder ask after a Done", () => {
  it("a saved Done on an Essential task offers it, with the next date", async () => {
    care.previewNextDue.mockResolvedValue("2027-02-17")
    renderHome()
    fireEvent.click(within(firstRow()).getByRole("button", { name: `Mark ${TITLE} done` }))
    expect(offer).not.toHaveBeenCalled() // the tap is not the moment: Undo is still possible
    await screen.findByText(/next due/)
    await acceptDone()
    await waitFor(() => expect(offer).toHaveBeenCalledWith({ title: TITLE, essential: true, itemName: "Furnace", nextDue: "2027-02-17" }))
  })

  it("passes a non-Essential task as such (the hook decides not to ask)", async () => {
    dash.priority = "high"
    renderHome()
    fireEvent.click(within(firstRow()).getByRole("button", { name: `Mark ${TITLE} done` }))
    await acceptDone()
    await waitFor(() => expect(offer).toHaveBeenCalledWith(expect.objectContaining({ essential: false })))
  })

  it("a Done that fails to save offers nothing", async () => {
    care.markTaskInstanceDone.mockResolvedValue({ success: false, error: "INTERNAL" })
    renderHome()
    fireEvent.click(within(firstRow()).getByRole("button", { name: `Mark ${TITLE} done` }))
    await acceptDone()
    await within(firstRow()).findByRole("alert")
    expect(offer).not.toHaveBeenCalled()
  })
})
