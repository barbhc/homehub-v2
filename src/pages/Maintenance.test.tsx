/**
 * The Tasks page (/maintenance) mounts BOTH trees — RefinedWeek on phones,
 * DesktopTasks at lg+ — and CSS shows one. Each tree used to fetch the agenda
 * and the care suggestions on its own, so every visit read the home doc, every
 * task instance, every item, every template and the home doc again, twice.
 *
 * Rendered here with both real trees (jsdom applies no CSS, so both are live):
 *   · one visit = one agenda read and one suggestions read;
 *   · a check-off in one tree leaves the task in neither (one shared list);
 *   · a failed read is a visible failure in both — never "Nothing due".
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SWRConfig } from "swr"

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  countHiddenCleaning: vi.fn(),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  getTaskDetail: vi.fn(),
  getTaskTemplates: vi.fn(),
  getItemUnits: vi.fn(),
  getHomeProfile: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  countHiddenCleaning: (...a: unknown[]) => svc.countHiddenCleaning(...a),
  markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => svc.snoozeTaskInstance(...a),
  getTaskDetail: (...a: unknown[]) => svc.getTaskDetail(...a),
  getTaskTemplates: (...a: unknown[]) => svc.getTaskTemplates(...a),
  addLibraryTask: vi.fn(),
  dismissLibrarySuggestion: vi.fn(),
  applyLibraryBackstop: vi.fn(),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "h1" } }),
  getHomeProfile: (...a: unknown[]) => svc.getHomeProfile(...a),
}))

const { default: Maintenance } = await import("./Maintenance")

const TASK = {
  taskInstanceId: "ti-1", taskTemplateId: "tt-1", title: "Replace the furnace filter", source: "maintenance",
  priorityTier: "essential", estimatedMinutes: 10, dueDate: new Date().toISOString().slice(0, 10),
  isOverdue: false, pastDue: false, dueKind: "window", windowState: "open", duePhrase: "Good to do now",
  safetyNote: null, trulyOverdue: false, itemUnitId: null, itemName: null, roomName: null,
}
const ok = <T,>(data: T) => ({ data, error: null })

const renderPage = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MemoryRouter>
        <Maintenance />
      </MemoryRouter>
    </SWRConfig>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.getWeekAgenda.mockResolvedValue(ok([TASK]))
  svc.countHiddenCleaning.mockResolvedValue(0)
  svc.getTaskDetail.mockResolvedValue(ok(null))
  svc.getItemUnits.mockResolvedValue(ok([]))
  svc.getTaskTemplates.mockResolvedValue(ok([]))
  svc.getHomeProfile.mockResolvedValue(ok(null))
})

describe("Tasks page — both trees, one fetch", () => {
  it("one visit reads the agenda once and the suggestions once, and both trees show it", async () => {
    renderPage()

    // Both trees are mounted: the phone header and the desktop header.
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument()
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    await waitFor(() => expect(svc.getHomeProfile).toHaveBeenCalled())

    expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1)
    expect(svc.getItemUnits).toHaveBeenCalledTimes(1)
    expect(svc.getTaskTemplates).toHaveBeenCalledTimes(1)
    expect(svc.getHomeProfile).toHaveBeenCalledTimes(1)
  })

  it("a check-off in one tree takes the task out of both", async () => {
    svc.markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: null })
    renderPage()
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)

    fireEvent.click(screen.getAllByLabelText("Mark done")[0])

    await waitFor(() => expect(screen.queryByText("Replace the furnace filter")).toBeNull())
    expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1) // no refetch for a local removal
  })

  it("a failed read says so in both trees — never 'Nothing due — enjoy the calm.'", async () => {
    svc.getWeekAgenda.mockResolvedValue({ data: null, error: { message: "Couldn't reach the server to load your tasks." } })
    renderPage()

    expect(await screen.findAllByText("Couldn't load your tasks")).toHaveLength(2)
    expect(screen.getAllByText("Couldn't reach the server to load your tasks.")).toHaveLength(2)
    expect(screen.queryByText(/Nothing due/)).toBeNull()
    // Nor "0" on the priority pills: a count of tasks we couldn't read is a claim.
    expect(screen.queryAllByText("0", { exact: true })).toHaveLength(0)
    expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1)

    // Try again (either tree) refetches the shared agenda; both recover.
    svc.getWeekAgenda.mockResolvedValue(ok([TASK]))
    fireEvent.click(screen.getAllByRole("button", { name: /try again/i })[0])
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    expect(screen.queryByText("Couldn't load your tasks")).toBeNull()
  })
})
