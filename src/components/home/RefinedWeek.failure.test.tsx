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
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { RefinedWeek } from "./RefinedWeek"

const getWeekAgenda = vi.fn()
const markTaskInstanceDone = vi.fn()
const snoozeTaskInstance = vi.fn()
const getTaskDetail = vi.fn()

vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => getWeekAgenda(...a),
  markTaskInstanceDone: (...a: unknown[]) => markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => snoozeTaskInstance(...a),
  getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
}))
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }))

const TASK = {
  taskInstanceId: "ti-1",
  taskTemplateId: "tt-1",
  title: "Replace the furnace filter",
  source: "maintenance",
  priorityTier: "essential",
  estimatedMinutes: 10,
  dueDate: new Date().toISOString().slice(0, 10),
  isOverdue: false,
  pastDue: false,
  itemUnitId: null,
  itemName: null,
  roomName: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getWeekAgenda.mockResolvedValue({ data: [TASK], error: null })
  getTaskDetail.mockResolvedValue({ data: { steps: [], infoBlurb: null }, error: null })
})

const renderAndSettle = async () => {
  render(<RefinedWeek homeId="home-1" />)
  await waitFor(() => expect(screen.getByText(/replace the furnace filter/i)).toBeInTheDocument())
}

/** The row toggles on a tap expressed as pointerdown+pointerup with no move. */
const expandRow = async () => {
  const row = screen.getByText(/replace the furnace filter/i).closest("div")!.parentElement!
  fireEvent.pointerDown(row, { clientX: 10, pointerId: 1 })
  fireEvent.pointerUp(row, { clientX: 10, pointerId: 1 })
  await waitFor(() => expect(screen.getByRole("button", { name: /^snooze$/i })).toBeInTheDocument())
}

describe("RefinedWeek — a failed check-off must say so", () => {
  it("mark done fails → error shown AND the task stays on the list", async () => {
    markTaskInstanceDone.mockResolvedValue({ success: false, error: "quota exceeded" })
    await renderAndSettle()

    fireEvent.click(screen.getByLabelText(/mark done/i))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/quota exceeded/i))
    expect(screen.getByText(/replace the furnace filter/i)).toBeInTheDocument()
  })

  it("snooze fails → error shown AND the task stays on the list", async () => {
    snoozeTaskInstance.mockResolvedValue({ success: false, error: "network down" })
    await renderAndSettle()

    // Snooze lives in the expanded row, and the row expands on a pointer
    // down/up with no movement — a swipe handler, not a click handler.
    await expandRow()
    fireEvent.click(screen.getByRole("button", { name: /^snooze$/i }))

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/network down/i))
    expect(screen.getByText(/replace the furnace filter/i)).toBeInTheDocument()
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
})
