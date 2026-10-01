/**
 * The desktop Tasks page, held to the phone's contract.
 *
 * HH-94: item-scoped cleaning never reaches the agenda — it lives in the item's
 * guides and in Deep Clean — so "Nothing due — enjoy the calm." over a home
 * with cleaning scheduled is the invisibility the owner reported three times.
 * The phone page learned to say where the work went; the desktop page kept
 * its own copy of the line and never did. Both now render one implementation.
 * The FOOTER half of HH-94 — a list with tasks on it still names the cleaning
 * it leaves out — could never render on either: the count was only taken for
 * an empty agenda. It is taken on every read now.
 *
 * Also pinned here, because the desktop tree had drifted on both:
 *   · a failed check-off or snooze says so and leaves the row where it was
 *     (it read only `res.success` and closed the row in silence);
 *   · the Suggested group renders ONCE, after the groups — it was nested in
 *     the groups.map and rendered inside every group's card.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SWRConfig } from "swr"
import { entryByKey } from "../../../shared/care/library"

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  getLastAgendaWithheld: vi.fn(),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  getLastAgendaWithheld: () => svc.getLastAgendaWithheld(),
  markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => svc.snoozeTaskInstance(...a),
  getTaskDetail: vi.fn().mockResolvedValue({ data: null, error: null }),
}))
// The standing Suggested group fetches on its own; tests hand it rows here.
const care = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock("@/hooks/useCareSuggestions", () => ({
  useCareSuggestions: () => ({ rows: care.rows, loading: false, error: null, add: vi.fn(), dismiss: vi.fn(), reload: vi.fn() }),
}))

const { DesktopTasks } = await import("./DesktopTasks")
const { RefinedWeek } = await import("./RefinedWeek")

const renderWith = (ui: React.ReactElement) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MemoryRouter>{ui}</MemoryRouter>
    </SWRConfig>,
  )

const task = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  taskInstanceId: id, taskTemplateId: `tt-${id}`, title, source: "maintenance", priorityTier: "essential",
  estimatedMinutes: 10, dueDate: new Date().toISOString().slice(0, 10), isOverdue: false, pastDue: false,
  dueKind: "window", windowState: "open", duePhrase: "Good to do now", safetyNote: null, trulyOverdue: false,
  itemUnitId: null, itemName: null, roomName: null, ...over,
})
const FILTER = task("ti-1", "Replace the furnace filter")
/** What getWeekAgenda withheld on its last read — the count the pages show. */
const withheld = (itemCleaning: number) =>
  svc.getLastAgendaWithheld.mockReturnValue({ beyondHorizon: 0, nextDueDate: null, itemCleaning })
const footer = () => screen.queryAllByRole("link", { name: /for your items lives? in Deep Clean/ })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  care.rows = []
  svc.getWeekAgenda.mockResolvedValue({ data: [], error: null })
  withheld(0)
})

describe("DesktopTasks — an empty list says where the cleaning went (HH-94)", () => {
  it("names the hidden cleaning instead of 'enjoy the calm'", async () => {
    withheld(3)
    renderWith(<DesktopTasks homeId="h1" />)
    expect(await screen.findByText("Nothing on the schedule — 3 cleaning jobs live in your guides.")).toBeInTheDocument()
    expect(screen.queryByText(/enjoy the calm/)).toBeNull()
    // Said once: the headline carries it, so no footer repeats it (not rendered).
    expect(footer()).toHaveLength(0)
  })

  it("one job is one job", async () => {
    withheld(1)
    renderWith(<DesktopTasks homeId="h1" />)
    expect(await screen.findByText("Nothing on the schedule — 1 cleaning job lives in your guides.")).toBeInTheDocument()
  })

  it("with nothing hidden, the calm line stands", async () => {
    withheld(0)
    renderWith(<DesktopTasks homeId="h1" />)
    expect(await screen.findByText("Nothing due — enjoy the calm.")).toBeInTheDocument()
  })

  it("phone and desktop say the same words — one implementation, not two that drift", async () => {
    withheld(2)
    renderWith(<><RefinedWeek homeId="h1" /><DesktopTasks homeId="h1" /></>)
    expect(await screen.findAllByText("Nothing on the schedule — 2 cleaning jobs live in your guides.")).toHaveLength(2)
  })
})

describe("a list WITH tasks still names the cleaning it leaves out (HH-94's footer)", () => {
  it("closes the list with a link to Deep Clean — phone and desktop, the same words", async () => {
    svc.getWeekAgenda.mockResolvedValue({ data: [FILTER], error: null })
    withheld(3)
    renderWith(<><RefinedWeek homeId="h1" /><DesktopTasks homeId="h1" /></>)

    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    const links = footer()
    expect(links).toHaveLength(2)
    for (const a of links) {
      expect(a).toHaveTextContent("3 cleaning jobs for your items live in Deep Clean →")
      expect(a).toHaveAttribute("href", "/clean")
    }
    // The headlines count the list; neither claims it is empty.
    expect(screen.getByText("1 to do")).toBeInTheDocument()
    expect(screen.getByText("1 thing across your home")).toBeInTheDocument()
    expect(screen.queryByText(/Nothing on the schedule|Nothing due/)).toBeNull()
  })

  it("one job lives, several live", async () => {
    svc.getWeekAgenda.mockResolvedValue({ data: [FILTER], error: null })
    withheld(1)
    renderWith(<DesktopTasks homeId="h1" />)
    await screen.findByText("Replace the furnace filter")
    expect(footer()).toHaveLength(1)
    expect(footer()[0]).toHaveTextContent("1 cleaning job for your items lives in Deep Clean →")
  })

  it("nothing withheld, no footer (not rendered)", async () => {
    svc.getWeekAgenda.mockResolvedValue({ data: [FILTER], error: null })
    withheld(0)
    renderWith(<><RefinedWeek homeId="h1" /><DesktopTasks homeId="h1" /></>)
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    expect(footer()).toHaveLength(0)
  })

  it("a filter that empties a full list says how much it hides — never 'Nothing on the schedule'", async () => {
    // The count used to be 0 for any non-empty agenda, so this headline read
    // "Nothing due — enjoy the calm." over five scheduled tasks. Counted always,
    // it would have claimed "Nothing on the schedule" — false either way.
    sessionStorage.setItem("homehub:tasks-tier", "optional")
    svc.getWeekAgenda.mockResolvedValue({ data: [FILTER], error: null })
    withheld(2)
    renderWith(<><RefinedWeek homeId="h1" /><DesktopTasks homeId="h1" /></>)

    expect(await screen.findByText("0 of 1")).toBeInTheDocument()
    expect(screen.getByText("0 of 1 across your home")).toBeInTheDocument()
    expect(screen.queryByText(/Nothing on the schedule|Nothing due/)).toBeNull()
    // The agenda has tasks, so the footer still closes the (filtered) list.
    expect(footer()).toHaveLength(2)
  })
})

describe("DesktopTasks — a failed check-off or snooze must say so (the phone's contract)", () => {
  beforeEach(() => {
    svc.getWeekAgenda.mockResolvedValue({ data: [FILTER], error: null })
  })
  const settle = async () => {
    renderWith(<DesktopTasks homeId="h1" />)
    await screen.findByText("Replace the furnace filter")
  }
  /** The row expands on a click anywhere on it; its detail carries Mark done + Snooze. */
  const expand = async () => {
    fireEvent.click(screen.getByText("Replace the furnace filter"))
    await screen.findByRole("button", { name: /^Snooze$/ })
  }

  it("mark done fails → the error is shown AND the task stays on the list", async () => {
    svc.markTaskInstanceDone.mockResolvedValue({ success: false, error: "quota exceeded" })
    await settle()

    fireEvent.click(screen.getByLabelText("Mark done"))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("quota exceeded"))
    expect(screen.getByText("Replace the furnace filter")).toBeInTheDocument()
  })

  it("snooze fails → the error is shown, and the open row is rolled back open, not closed", async () => {
    svc.snoozeTaskInstance.mockResolvedValue({ success: false, error: "network down" })
    await settle()
    await expand()

    fireEvent.click(screen.getByRole("button", { name: /^Snooze$/ }))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("network down"))
    expect(screen.getByText("Replace the furnace filter")).toBeInTheDocument()
    // Collapsed only while the write was in flight; open again now it failed.
    expect(screen.getByRole("button", { name: /^Snooze$/ })).toBeInTheDocument()
  })

  it("a write that throws is said too — never swallowed", async () => {
    svc.markTaskInstanceDone.mockRejectedValue(new Error("You're offline"))
    await settle()

    fireEvent.click(screen.getByLabelText("Mark done"))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("You're offline"))
    expect(screen.getByText("Replace the furnace filter")).toBeInTheDocument()
  })

  it("a failure with no message still says something", async () => {
    svc.snoozeTaskInstance.mockResolvedValue({ success: false, error: "" })
    await settle()
    await expand()

    fireEvent.click(screen.getByRole("button", { name: /^Snooze$/ }))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not snooze that task."))
  })

  it("mark done SUCCEEDS → no error, task removed (the control case)", async () => {
    svc.markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: null })
    await settle()

    fireEvent.click(screen.getByLabelText("Mark done"))

    await waitFor(() => expect(screen.queryByText("Replace the furnace filter")).toBeNull())
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("DesktopTasks — the Suggested group renders once, after the groups (where the phone puts it)", () => {
  const hepa = entryByKey("air_purifier.hepa")!

  it("three groups, one Suggested group, below the last of them", async () => {
    care.rows = [{ entry: hepa, itemUnitId: "item-levoit", itemName: "Levoit Core 400S" }]
    svc.getWeekAgenda.mockResolvedValue({
      data: [
        task("ti-deadline", "Renew the boiler certificate", { dueKind: "deadline" }),
        task("ti-now", "Replace the furnace filter"),
        task("ti-later", "Clean the gutters", { windowState: "upcoming" }),
      ],
      error: null,
    })
    renderWith(<DesktopTasks homeId="h1" />)
    await screen.findByText("Clean the gutters")

    // Rendered once — it used to sit inside each of the three group cards.
    const groups = screen.getAllByTestId("suggested-group")
    expect(groups).toHaveLength(1)
    expect(within(groups[0]).getAllByTestId("suggested-row")).toHaveLength(1)
    expect(screen.getAllByText(hepa.title)).toHaveLength(1)
    // …and after every task, not between them.
    for (const title of ["Renew the boiler certificate", "Replace the furnace filter", "Clean the gutters"]) {
      expect(screen.getByText(title).compareDocumentPosition(groups[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(within(groups[0]).queryByText(title)).toBeNull()
    }
  })

  it("an empty list still shows the suggestions, as the phone does", async () => {
    care.rows = [{ entry: hepa, itemUnitId: "item-levoit", itemName: "Levoit Core 400S" }]
    renderWith(<DesktopTasks homeId="h1" />)
    expect(await screen.findByText("Nothing due — enjoy the calm.")).toBeInTheDocument()
    expect(screen.getAllByTestId("suggested-group")).toHaveLength(1)
  })
})
