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
 *
 * And the Upkeep | Cleaning control (design/tasks-items-views.md): it switches
 * views and writes ?view=; Cleaning is mounted ONCE (not per tree) and draws
 * none of Upkeep's own controls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { SWRConfig } from "swr"
import { localToday } from "../../shared/dates/calendar"

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  getTaskDetail: vi.fn(),
  getTaskTemplates: vi.fn(),
  getItemUnits: vi.fn(),
  getHomeProfile: vi.fn(),
  getDeepCleanGuides: vi.fn(),
  getCleaningTasks: vi.fn(),
  getRooms: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => svc.snoozeTaskInstance(...a),
  getTaskDetail: (...a: unknown[]) => svc.getTaskDetail(...a),
  previewNextDue: vi.fn(async () => null),
  unsnoozeTaskInstance: vi.fn(),
  getTaskTemplates: (...a: unknown[]) => svc.getTaskTemplates(...a),
  addLibraryTask: vi.fn(),
  dismissLibrarySuggestion: vi.fn(),
  applyLibraryBackstop: vi.fn(),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "h1" } }),
  getHomeProfile: (...a: unknown[]) => svc.getHomeProfile(...a),
  getRooms: (...a: unknown[]) => svc.getRooms(...a),
}))
vi.mock("@/lib/cleanSession", () => ({
  getDeepCleanGuides: (...a: unknown[]) => svc.getDeepCleanGuides(...a),
  getCleaningTasks: (...a: unknown[]) => svc.getCleaningTasks(...a),
  saveRoutineTask: vi.fn(),
}))

const { default: Maintenance } = await import("./Maintenance")
const { resetDoneQueueForTests } = await import("@/components/home/tasks/doneQueue")

const TASK = {
  taskInstanceId: "ti-1", taskTemplateId: "tt-1", title: "Replace the furnace filter", source: "maintenance",
  priorityTier: "essential", estimatedMinutes: 10, dueDate: localToday(),
  isOverdue: false, pastDue: false, dueKind: "window", windowState: "open", duePhrase: "Good to do now",
  safetyNote: null, trulyOverdue: false, itemUnitId: null, itemName: null, roomName: null,
}
const ok = <T,>(data: T) => ({ data, error: null })
/** getWeekAgenda's answer: the rows, and what that read withheld (none here). */
const agenda = <T,>(rows: T) => ({ ...ok(rows), withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 } })

const renderPage = (at = "/maintenance") =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MemoryRouter initialEntries={[at]}>
        <Maintenance />
        <Where />
      </MemoryRouter>
    </SWRConfig>,
  )

function Where() {
  const loc = useLocation()
  return <span data-testid="where">{loc.pathname + loc.search}</span>
}

const GUIDES = [
  { id: "g1", title: "Clean the Bosch dishwasher", estimatedMinutes: 20, itemUnitId: "i1" },
  { id: "g2", title: "Descale the kettle", estimatedMinutes: 10, itemUnitId: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.getWeekAgenda.mockResolvedValue(agenda([TASK]))
  svc.getTaskDetail.mockResolvedValue(ok(null))
  svc.getItemUnits.mockResolvedValue(ok([]))
  svc.getTaskTemplates.mockResolvedValue(ok([]))
  svc.getHomeProfile.mockResolvedValue(ok(null))
  svc.getDeepCleanGuides.mockResolvedValue(GUIDES)
  svc.getRooms.mockResolvedValue(ok([]))
})

describe("Tasks page — both trees, one fetch", () => {
  it("one visit reads the agenda once and the suggestions once, and both trees show it", async () => {
    renderPage()

    // Both trees are mounted: the phone header and the desktop header — both "Tasks".
    expect(screen.getAllByRole("heading", { level: 1, name: "Tasks" })).toHaveLength(2)
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
    // A Done from a list is written when its Undo bar goes; closing the bar writes it now.
    const close = within(await screen.findByRole("status")).getByRole("button", { name: "Dismiss" })
    await act(async () => {
      fireEvent.click(close)
    })

    await waitFor(() => expect(screen.queryByText("Replace the furnace filter")).toBeNull())
    expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1) // no refetch for a local removal
  })

  it("a Done refused after its screen had gone is said ONCE — not by both trees", async () => {
    localStorage.setItem("hh:pending-dones:v1", JSON.stringify([
      { uid: "", homeId: "h1", id: "ti-9", label: "Flush the water heater", completedOn: localToday(), nextDue: null, state: "failed", error: "You're offline" },
    ]))
    resetDoneQueueForTests()
    renderPage()
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    expect(await screen.findAllByText("Couldn't mark “Flush the water heater” done.")).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1)
    localStorage.clear()
    resetDoneQueueForTests()
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
    svc.getWeekAgenda.mockResolvedValue(agenda([TASK]))
    fireEvent.click(screen.getAllByRole("button", { name: /try again/i })[0])
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    expect(screen.queryByText("Couldn't load your tasks")).toBeNull()
  })
})

describe("Tasks page — Upkeep | Cleaning", () => {
  /** Both trees' controls (phone and desktop are both mounted in jsdom). */
  const tablists = () => screen.getAllByRole("tablist", { name: "Tasks view" })

  it("the control switches to Cleaning and writes ?view=cleaning; Upkeep takes the param away again", async () => {
    renderPage()
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    expect(tablists()).toHaveLength(2)
    for (const list of tablists()) {
      expect(within(list).getByRole("tab", { name: "Upkeep" })).toHaveAttribute("aria-selected", "true")
      expect(within(list).getByRole("tab", { name: "Cleaning" })).toHaveAttribute("aria-selected", "false")
    }
    // Upkeep is today's page, its lenses in both trees…
    expect(screen.getAllByRole("button", { name: /^Urgency$/i })).toHaveLength(2)
    // …and Cleaning's content is not rendered, nor read.
    expect(screen.queryByText("Start cleaning")).toBeNull()
    expect(svc.getDeepCleanGuides).not.toHaveBeenCalled()

    fireEvent.click(within(tablists()[0]).getByRole("tab", { name: "Cleaning" }))

    expect(screen.getByTestId("where")).toHaveTextContent("/maintenance?view=cleaning")
    for (const list of tablists()) {
      expect(within(list).getByRole("tab", { name: "Cleaning" })).toHaveAttribute("aria-selected", "true")
    }
    // Clean's content, mounted ONCE under both headers — one guides read.
    expect(await screen.findByText("Clean the Bosch dishwasher")).toBeInTheDocument()
    expect(screen.getAllByText("Start cleaning")).toHaveLength(1)
    expect(svc.getDeepCleanGuides).toHaveBeenCalledTimes(1)
    // The count line under the title, in both trees.
    expect(screen.getAllByText("2 cleaning guides")).toHaveLength(2)
    expect(screen.queryByText("1 to do")).toBeNull()

    fireEvent.click(within(tablists()[1]).getByRole("tab", { name: "Upkeep" }))
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/maintenance$/)
    expect(screen.queryByText("Start cleaning")).toBeNull()
    expect(screen.getAllByText("Replace the furnace filter")).toHaveLength(2)
  })

  it("the arrow keys move the selection, and it is written to the URL", async () => {
    renderPage()
    const upkeep = within(tablists()[0]).getByRole("tab", { name: "Upkeep" })
    // One Tab stop: the selected segment.
    expect(upkeep).toHaveAttribute("tabindex", "0")
    expect(within(tablists()[0]).getByRole("tab", { name: "Cleaning" })).toHaveAttribute("tabindex", "-1")
    fireEvent.keyDown(upkeep, { key: "ArrowRight" })
    expect(screen.getByTestId("where")).toHaveTextContent("/maintenance?view=cleaning")
    expect(within(tablists()[0]).getByRole("tab", { name: "Cleaning" })).toHaveFocus()
  })

  it("in Cleaning, Upkeep's own controls are not rendered — lenses, priority filter, calendar — nor its list", async () => {
    renderPage("/maintenance?view=cleaning")
    expect(await screen.findByText("Clean the Bosch dishwasher")).toBeInTheDocument()
    await waitFor(() => expect(svc.getWeekAgenda).toHaveBeenCalled())

    // Not rendered (absent from the DOM), in either tree.
    for (const lens of ["Urgency", "Room", "Item", "Calendar"]) {
      expect(screen.queryAllByRole("button", { name: new RegExp(`^${lens}$`, "i") })).toHaveLength(0)
    }
    expect(screen.queryAllByRole("button", { name: /Needs you|All priorities|Essential|Recommended|Optional/ })).toHaveLength(0)
    expect(screen.queryByText("Pick a date")).toBeNull()
    expect(screen.queryByText("Pick a day")).toBeNull()
    expect(screen.queryByText("Replace the furnace filter")).toBeNull()
    // The page is still Tasks, with its count in Cleaning's words.
    expect(screen.getAllByRole("heading", { level: 1, name: "Tasks" })).toHaveLength(2)
    expect(screen.getAllByText("2 cleaning guides")).toHaveLength(2)
  })

  it("Cleaning has no 'This week' list of its own (not rendered): the week is one list, in Upkeep", async () => {
    renderPage("/maintenance?view=cleaning")
    expect(await screen.findByText("Clean the Bosch dishwasher")).toBeInTheDocument()
    expect(screen.queryByText("This week")).toBeNull()
    expect(screen.queryByText(/Nothing due this week/)).toBeNull()
    expect(svc.getCleaningTasks).not.toHaveBeenCalled()
  })

  it("a failed guides read says so below and claims no count above", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    svc.getDeepCleanGuides.mockRejectedValue(new Error("unavailable"))
    renderPage("/maintenance?view=cleaning")
    expect(await screen.findByText("Couldn't load your cleaning guides.")).toBeInTheDocument()
    expect(screen.queryByText(/cleaning guides?$/)).toBeNull()
  })
})
