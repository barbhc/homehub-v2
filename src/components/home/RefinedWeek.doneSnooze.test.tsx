/**
 * One Done and Snooze everywhere — the Tasks page (owner, 2026-10-15).
 *
 * On main the Tasks rows snoozed for 7 days in silence and marked done in
 * silence, with no Undo for either, and the phone's swipe did the same. Home
 * and the item page snoozed for 14 days with "Snoozed until … · Undo". Now
 * every list shares one hook (useTaskActions):
 *  · Snooze is 14 days, says "Snoozed until {date}", and Undo un-snoozes;
 *  · Done takes the row off, says "Done · next due {date}" with Undo, and is
 *    only WRITTEN when that bar goes — so Undo means nothing was ever written;
 *  · leaving the page writes a Done still in its Undo window (never lost);
 *  · the swipe goes through the same bar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { RefinedWeek } from "./RefinedWeek"
import { DONE_UNDO_MS } from "./tasks/shared"
import { addDays, localToday } from "../../../shared/dates/calendar"

const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>)

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  unsnoozeTaskInstance: vi.fn(),
  previewNextDue: vi.fn(),
  getTaskDetail: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => svc.snoozeTaskInstance(...a),
  unsnoozeTaskInstance: (...a: unknown[]) => svc.unsnoozeTaskInstance(...a),
  previewNextDue: (...a: unknown[]) => svc.previewNextDue(...a),
  getTaskDetail: (...a: unknown[]) => svc.getTaskDetail(...a),
}))
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@/hooks/useCareSuggestions", () => ({
  useCareSuggestions: () => ({ rows: [], loading: false, error: null, add: vi.fn(), dismiss: vi.fn(), reload: vi.fn() }),
}))

const TITLE = "Replace the furnace filter"
const TASK = {
  taskInstanceId: "ti-1", taskTemplateId: "tt-1", title: TITLE, source: "maintenance", priorityTier: "essential",
  estimatedMinutes: 10, dueDate: localToday(), isOverdue: false, pastDue: false, dueKind: "window",
  windowState: "open", duePhrase: "Good to do now", safetyNote: null, trulyOverdue: false,
  itemUnitId: null, itemName: null, roomName: null,
}
const NEXT_DUE = addDays(localToday(), 30)
const short = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })

beforeEach(() => {
  vi.clearAllMocks()
  svc.getWeekAgenda.mockResolvedValue({ data: [TASK], error: null, withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 } })
  svc.getTaskDetail.mockResolvedValue({ data: { steps: [], infoBlurb: null }, error: null })
  svc.markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: "ti-2" })
  svc.snoozeTaskInstance.mockResolvedValue({ success: true })
  svc.unsnoozeTaskInstance.mockResolvedValue({ success: true })
  svc.previewNextDue.mockResolvedValue(NEXT_DUE)
})
afterEach(() => {
  vi.useRealTimers()
})

const settle = async () => {
  const view = render(<RefinedWeek homeId="home-1" />)
  await screen.findByText(TITLE)
  return view
}
const rowEl = () => screen.getByTestId("phone-task-row")
const bar = () => screen.findByRole("status")

/** The row toggles on pointer down/up with no movement; a drag past 72px is a swipe. */
const drag = (dx: number) => {
  const target = screen.getByText(TITLE).closest("div")!.parentElement!
  fireEvent.pointerDown(target, { clientX: 100, pointerId: 1 })
  fireEvent.pointerMove(target, { clientX: 100 + dx, pointerId: 1 })
  fireEvent.pointerUp(target, { clientX: 100 + dx, pointerId: 1 })
}

describe("Tasks — Snooze is the 14-day snooze with a receipt and Undo", () => {
  it("snoozes for 14 days, says until when, and Undo un-snoozes and brings it back", async () => {
    await settle()
    drag(0) // open the row
    fireEvent.click(await screen.findByRole("button", { name: /^snooze$/i }))

    await waitFor(() => expect(svc.snoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1", addDays(localToday(), 14)))
    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Snoozed until ${short(addDays(localToday(), 14))}`)
    expect(screen.queryByText(TITLE)).toBeNull()

    const reads = svc.getWeekAgenda.mock.calls.length
    fireEvent.click(within(receipt).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(svc.unsnoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1"))
    // The agenda is read again, so the task is back where it was.
    await waitFor(() => expect(svc.getWeekAgenda.mock.calls.length).toBeGreaterThan(reads))
    expect(await screen.findByText(TITLE)).toBeInTheDocument()
  })
})

describe("Tasks — Done from the list: receipt and Undo first, the write after", () => {
  it("says 'Done · next due {date}' with Undo, and Undo means nothing is ever written", async () => {
    const view = await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))

    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Done · next due ${short(NEXT_DUE)}`)
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()

    fireEvent.click(within(receipt).getByRole("button", { name: "Undo" }))
    expect(await screen.findByText(TITLE)).toBeInTheDocument()

    // Not at the timer, and not when the page goes away either.
    view.unmount()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()
  })

  it("is written when the Undo window runs out — with the date the receipt named", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true })
    await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))
    await bar()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(DONE_UNDO_MS + 50)
    })
    await waitFor(() =>
      expect(svc.markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, { completedOn: localToday(), nextDueOverride: NEXT_DUE }))
    expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1)
  })

  it("leaving the page inside the Undo window still writes the Done — never lost", async () => {
    const view = await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))
    await bar()
    view.unmount()
    expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(svc.markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, expect.objectContaining({ completedOn: localToday() }))
  })
})

describe("Tasks — the swipe uses the same bar", () => {
  it("swipe right is Done, with 'Done · next due' and Undo", async () => {
    await settle()
    drag(110)
    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Done · next due ${short(NEXT_DUE)}`)
    expect(within(receipt).getByRole("button", { name: "Undo" })).toBeInTheDocument()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()
  })

  it("swipe left is the 14-day Snooze, with 'Snoozed until' and Undo", async () => {
    await settle()
    drag(-110)
    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Snoozed until ${short(addDays(localToday(), 14))}`)
    expect(within(receipt).getByRole("button", { name: "Undo" })).toBeInTheDocument()
    expect(svc.snoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1", addDays(localToday(), 14))
  })
})
