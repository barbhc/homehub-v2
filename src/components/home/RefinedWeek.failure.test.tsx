/**
 * Failure-path coverage for check-off and snooze on the week agenda.
 *
 * This screen had NO error state at all. `onDone` and `onSnooze` both read
 * `if (res.success)` and did nothing on failure, while `setOpenId(null)` ran
 * unconditionally — so a failed check-off closed the row and said nothing. The
 * task then sits there looking untouched, which reads as "my tap didn't
 * register" rather than "the write failed", and the natural response is to tap
 * again.
 *
 * Both tests force the service to fail and assert the error is on screen AND
 * the task is still listed — a task that did not complete must not disappear.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, render as rtlRender, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { RefinedWeek } from "./RefinedWeek"
import { localToday } from "../../../shared/dates/calendar"

// The agenda is SWR-cached (useWeekAgenda), so each test gets a fresh cache —
// otherwise a later test would read an earlier one's agenda, including the
// task the success case removed.
const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>)

const getWeekAgenda = vi.fn()
const markTaskInstanceDone = vi.fn()
const snoozeTaskInstance = vi.fn()
const getTaskDetail = vi.fn()
const previewNextDue = vi.fn()
const unsnoozeTaskInstance = vi.fn()

vi.mock("@/modules/care", () => ({
  previewNextDue: (...a: unknown[]) => previewNextDue(...a),
  unsnoozeTaskInstance: (...a: unknown[]) => unsnoozeTaskInstance(...a),
  getWeekAgenda: (...a: unknown[]) => getWeekAgenda(...a),
  markTaskInstanceDone: (...a: unknown[]) => markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => snoozeTaskInstance(...a),
  getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
}))
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }))
// The standing Suggested group fetches items/templates/profile on its own; this
// file tests the check-off contract, so the library is quiet here. (Without the
// mock its fetch fails in jsdom and the group's own error alert trips the
// "no error" control case.)
vi.mock("@/hooks/useCareSuggestions", () => ({
  useCareSuggestions: () => ({ rows: [], loading: false, error: null, add: vi.fn(), dismiss: vi.fn(), reload: vi.fn() }),
}))

const TASK = {
  taskInstanceId: "ti-1",
  taskTemplateId: "tt-1",
  title: "Replace the furnace filter",
  source: "maintenance",
  priorityTier: "essential",
  estimatedMinutes: 10,
  dueDate: localToday(),
  isOverdue: false,
  pastDue: false,
  dueKind: "window",
  windowState: "open",
  duePhrase: "Good to do now",
  safetyNote: null,
  trulyOverdue: false,
  itemUnitId: null,
  itemName: null,
  roomName: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  // With the agenda's own tally of the cleaning it withheld (HH-94) — none here.
  getWeekAgenda.mockResolvedValue({ data: [TASK], error: null, withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 } })
  getTaskDetail.mockResolvedValue({ data: { steps: [], infoBlurb: null }, error: null })
  previewNextDue.mockResolvedValue("2026-11-15")
  unsnoozeTaskInstance.mockResolvedValue({ success: true })
})

/** A Done from a list is written when its Undo bar goes; closing the bar writes it now. */
const acceptDone = async () => {
  const close = within(await screen.findByRole("status")).getByRole("button", { name: "Dismiss" })
  await act(async () => {
    fireEvent.click(close)
  })
}

const renderAndSettle = async () => {
  render(<RefinedWeek homeId="home-1" />)
  // On the read, not a clock (see DesktopTasks.test.tsx `loaded`): the agenda
  // has resolved and its row is on screen. The timeout is a stalled runner's ceiling.
  await waitFor(() => expect(getWeekAgenda).toHaveBeenCalled(), { timeout: 15_000 })
  await act(async () => {
    await getWeekAgenda.mock.results[getWeekAgenda.mock.results.length - 1].value
  })
  await screen.findByText(/replace the furnace filter/i, undefined, { timeout: 15_000 })
}

/** The row opens on its opener — a real button, announced with aria-expanded. */
const expandRow = async () => {
  const row = screen.getByTestId("phone-task-row")
  fireEvent.click(within(row).getByRole("button", { expanded: false }))
  await waitFor(() => expect(screen.getByRole("button", { name: /^snooze$/i })).toBeInTheDocument())
  expect(within(row).getByRole("button", { expanded: true })).toBeInTheDocument()
}

/** The phone row a title belongs to. */
const rowOf = (title: RegExp) =>
  screen.getAllByTestId("phone-task-row").find((r) => within(r).queryByText(title))!

describe("RefinedWeek — a failed check-off must say so", () => {
  it("mark done fails → error shown ON the row AND the task stays on the list", async () => {
    markTaskInstanceDone.mockResolvedValue({ success: false, error: "quota exceeded" })
    await renderAndSettle()

    fireEvent.click(screen.getByLabelText(/mark done/i))
    await acceptDone()

    // Home's words (#230); the service's raw error goes to the log, not the person.
    const row = rowOf(/replace the furnace filter/i)
    await waitFor(() => expect(within(row).getByRole("alert")).toHaveTextContent("Couldn't mark this done. Check your connection and try again."))
    expect(within(row).getByRole("alert")).not.toHaveTextContent(/quota exceeded/i)
    // Said once, on the row — not (also) in the page header.
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByText(/replace the furnace filter/i)).toBeInTheDocument()
  })

  it("snooze fails → error shown ON the row AND the task stays on the list", async () => {
    snoozeTaskInstance.mockResolvedValue({ success: false, error: "network down" })
    await renderAndSettle()

    // Snooze lives in the expanded row.
    await expandRow()
    fireEvent.click(screen.getByRole("button", { name: /^snooze$/i }))

    const row = rowOf(/replace the furnace filter/i)
    await waitFor(() => expect(within(row).getByRole("alert")).toHaveTextContent("Couldn't snooze this. Check your connection and try again."))
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByText(/replace the furnace filter/i)).toBeInTheDocument()
  })

  it("a failure on a LOWER row is said on that row — where a long list's header would be off screen", async () => {
    const second = { ...TASK, taskInstanceId: "ti-2", taskTemplateId: "tt-2", title: "Test smoke alarms" }
    getWeekAgenda.mockResolvedValue({ data: [TASK, second], error: null, withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 } })
    markTaskInstanceDone.mockResolvedValue({ success: false, error: "unavailable" })
    render(<RefinedWeek homeId="home-1" />)
    await waitFor(() => expect(screen.getByText(/test smoke alarms/i)).toBeInTheDocument())

    fireEvent.click(within(rowOf(/test smoke alarms/i)).getByLabelText(/mark done/i))
    await acceptDone()

    await waitFor(() => expect(within(rowOf(/test smoke alarms/i)).getByRole("alert")).toHaveTextContent("Couldn't mark this done."))
    expect(within(rowOf(/replace the furnace filter/i)).queryByRole("alert")).toBeNull()
  })

  it("mark done SUCCEEDS → no error, task removed (the control case)", async () => {
    markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: null })
    await renderAndSettle()

    fireEvent.click(screen.getByLabelText(/mark done/i))

    await waitFor(() =>
      expect(screen.queryByText(/replace the furnace filter/i)).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("a swiped-away Done whose write is REJECTED comes back: row on the list, error on it, no 'Done' left, nothing left mid-swipe", async () => {
    markTaskInstanceDone.mockRejectedValue(new Error("network down"))
    await renderAndSettle()

    // Swipe right past the commit distance (jsdom: the row is the window's 1024 wide).
    const surface = screen.getByTestId("phone-task-row-surface")
    fireEvent.pointerDown(surface, { clientX: 300, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 700, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(surface, { clientX: 700, clientY: 10, pointerId: 1 })
    // It left the list at once (the optimistic half)…
    await screen.findByRole("status")
    expect(screen.queryByText(/replace the furnace filter/i)).toBeNull()
    // …and the write, when it goes, is refused.
    await acceptDone()

    const row = await waitFor(() => rowOf(/replace the furnace filter/i))
    await waitFor(() => expect(within(row).getByRole("alert")).toHaveTextContent("Couldn't mark this done."))
    // Never a success state: no "Done" receipt, and no "Couldn't mark X done" second line either.
    // (A bar sliding away has no status role: only a live bar counts.)
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByText(/Couldn't mark “/)).toBeNull()
    // Back whole: not leaving, not inert, nothing left inline from the swipe.
    expect(row).not.toHaveAttribute("data-leaving")
    expect(row).not.toHaveAttribute("inert")
    expect(row).not.toHaveAttribute("data-reveal")
    expect(row.style.height).toBe("")
    await waitFor(() => expect((row.querySelector("[data-testid=phone-task-row-surface]")!.parentElement as HTMLElement).style.transform).toBe(""))
  })

  it("a swiped-away Snooze whose write FAILS springs back with the error on the row", async () => {
    snoozeTaskInstance.mockRejectedValue(new Error("network down"))
    await renderAndSettle()
    const surface = screen.getByTestId("phone-task-row-surface")
    fireEvent.pointerDown(surface, { clientX: 700, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 300, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(surface, { clientX: 300, clientY: 10, pointerId: 1 })

    const row = rowOf(/replace the furnace filter/i)
    await waitFor(() => expect(within(row).getByRole("alert")).toHaveTextContent("Couldn't snooze this."))
    expect(screen.queryByText(/Snoozed until/)).toBeNull()
    await waitFor(() => expect(row).not.toHaveAttribute("data-reveal"), { timeout: 3000 })
    expect((surface.parentElement as HTMLElement).style.transform).toBe("")
  })
})
