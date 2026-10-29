/**
 * The feedback sheet's confirm step looks for similar tasks, and says so while
 * it looks.
 *
 * Its "Looking for similar tasks…" flag used to be set by the effect that
 * starts the read; H5 (the whole-app lint) sets it in the render that enters
 * confirm, and leaves the read to the effect. Pinned: entering confirm shows
 * the search with Apply held back, the similar tasks arrive ticked, and going
 * Back then Continue again looks again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"

const getFeedbackContext = vi.hoisted(() => vi.fn())
const submitTaskFeedback = vi.hoisted(() => vi.fn())
const previewCadenceChange = vi.hoisted(() => vi.fn())
vi.mock("@/modules/care/services/cadenceChangeService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  previewCadenceChange: (...a: unknown[]) => previewCadenceChange(...a),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/modules/home", () => ({ upsertHomeProfile: vi.fn() }))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFeedbackContext: (...a: unknown[]) => getFeedbackContext(...a),
  submitTaskFeedback: (...a: unknown[]) => submitTaskFeedback(...a),
  discussTask: vi.fn(),
}))

const { TaskFeedbackSheet } = await import("./TaskFeedbackSheet")

/** A read we answer by hand, so the in-between state can be looked at. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const CONTEXT = {
  data: {
    match: { by: "title" },
    similar: [{ taskTemplateId: "t2", title: "Descale the kettle" }],
  },
  error: null,
}

function renderSheet() {
  render(
    <MemoryRouter>
      <TaskFeedbackSheet
        homeId="h1" taskTemplateId="t1" taskInstanceId={null} title="Descale the coffee maker"
        tier="recommended" onClose={vi.fn()} onApplied={vi.fn()}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  previewCadenceChange.mockReset()
  previewCadenceChange.mockResolvedValue({
    data: { kind: "scheduled", nextDue: "2026-12-08", basis: "last-done", overdue: false, moves: [], create: false }, error: null,
  })
})

describe("TaskFeedbackSheet · confirm looks for similar tasks", () => {
  beforeEach(() => getFeedbackContext.mockReset())

  it("shows the search with Apply held back, then the similar tasks, ticked", async () => {
    const read = deferred<typeof CONTEXT>()
    getFeedbackContext.mockReturnValue(read.promise)
    renderSheet()

    fireEvent.click(screen.getByText("Not relevant to my home"))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))

    expect(screen.getByText("Looking for similar tasks…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Apply/ })).toBeDisabled()
    expect(getFeedbackContext).toHaveBeenCalledWith("h1", "t1")

    read.resolve(CONTEXT)
    await waitFor(() => expect(screen.getByText("Descale the kettle")).toBeInTheDocument())
    expect(screen.queryByText("Looking for similar tasks…")).toBeNull()
    expect(screen.getByRole("button", { name: "Apply to 2 tasks" })).toBeEnabled()
  })

  it("Back then Continue looks again", async () => {
    getFeedbackContext.mockResolvedValue(CONTEXT)
    renderSheet()

    fireEvent.click(screen.getByText("Not relevant to my home"))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => expect(screen.getByText("Descale the kettle")).toBeInTheDocument())

    const again = deferred<typeof CONTEXT>()
    getFeedbackContext.mockReturnValue(again.promise)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(screen.getByText("Looking for similar tasks…")).toBeInTheDocument()
    expect(getFeedbackContext).toHaveBeenCalledTimes(2)

    again.resolve(CONTEXT)
    await waitFor(() => expect(screen.queryByText("Looking for similar tasks…")).toBeNull())
  })
})

/**
 * HH-164: the same snap-back lived here. Clearing "How many" stored 1 and
 * re-rendered "1" with the cursor after it, so typing 6 gave 16.
 */
describe("TaskFeedbackSheet · the custom interval box (HH-164)", () => {
  it("clear, type 6 → 6, and 6 weeks (42 days) is what is confirmed and sent", async () => {
    getFeedbackContext.mockResolvedValue(CONTEXT)
    // An error answer keeps the sheet on confirm; the call's arguments are the point.
    submitTaskFeedback.mockResolvedValue({ data: null, error: { message: "stop here" } })
    const user = userEvent.setup()
    renderSheet()
    fireEvent.click(screen.getByText("Too often"))
    fireEvent.click(screen.getByText("Something else…"))
    const box = screen.getByRole("spinbutton", { name: "How many" }) as HTMLInputElement
    expect(box.value).toBe("2")
    await user.clear(box)
    await user.type(box, "6")
    expect(box.value).toBe("6")
    expect((screen.getByRole("combobox", { name: "Unit" }) as HTMLSelectElement).value).toBe("weeks")

    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(screen.getByText(/Change to every 6 weeks/i)).toBeInTheDocument()
    // The date the change lands on, shown before Apply, from the same plan the save writes.
    expect(previewCadenceChange).toHaveBeenCalledWith("h1", "t1", { scheduleType: "every_n_days", intervalDays: 42, season: null })
    expect(await screen.findByTestId("next-due")).toHaveTextContent(/^Next due: Dec 8$/)
    await waitFor(() => expect(screen.getByRole("button", { name: /^Apply/ })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: /^Apply/ }))
    await waitFor(() => expect(submitTaskFeedback).toHaveBeenCalled())
    expect(submitTaskFeedback.mock.calls[0][0].resolution).toEqual({
      action: "cadence", scheduleType: "every_n_days", intervalDays: 42,
    })
  })
})

/**
 * Owner decision 2026-10-28: a cadence that goes seasonal on a task with no
 * season ASKS for one — no error, no guess — and Apply waits for the answer.
 */
describe("TaskFeedbackSheet · seasonal with no season asks", () => {
  it("shows the season question, holds Apply, then shows the date and sends the season", async () => {
    getFeedbackContext.mockResolvedValue({ ...CONTEXT, data: { ...CONTEXT.data, primary: { season: null } } })
    submitTaskFeedback.mockResolvedValue({ data: null, error: { message: "stop here" } })
    previewCadenceChange.mockImplementation(async (_h: string, _t: string, choice: { season?: string | null }) => ({
      data: choice.season
        ? { kind: "scheduled", nextDue: "2027-04-15", basis: "last-done", overdue: false, moves: [], create: false }
        : { kind: "needs-season" },
      error: null,
    }))
    const { proposalToResolution } = await import("@/modules/care")
    expect(proposalToResolution({ action: "cadence", scheduleType: "seasonal" } as never)).toMatchObject({ scheduleType: "seasonal" })

    // jsdom has no element scrolling; the discuss thread scrolls itself.
    Element.prototype.scrollTo = vi.fn() as never
    renderSheet()
    // The chip set offers no "Seasonal"; the assistant can propose one. Drive
    // the same state the proposal sets.
    fireEvent.click(screen.getByText("Discuss with the assistant"))
    const { discussTask } = await import("@/modules/care")
    ;(discussTask as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { explanation: "Do it each spring.", proposal: { action: "cadence", scheduleType: "seasonal", rationale: "Once a year, in spring." } },
      error: null,
    })
    fireEvent.change(screen.getAllByRole("textbox", { name: "Message" })[0], { target: { value: "less often?" } })
    fireEvent.click(screen.getAllByRole("button", { name: "Send" })[0])
    fireEvent.click(await screen.findByRole("button", { name: "Apply this change" }))

    expect(await screen.findByText("Which season?")).toBeInTheDocument()
    expect(screen.queryByTestId("next-due")).toBeNull()
    await waitFor(() => expect(screen.getByRole("button", { name: /^Apply/ })).toBeDisabled())

    fireEvent.click(screen.getByRole("button", { name: "Spring" }))
    expect(await screen.findByTestId("next-due")).toHaveTextContent("Next due: Apr 15, 2027")
    await waitFor(() => expect(screen.getByRole("button", { name: /^Apply/ })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: /^Apply/ }))
    await waitFor(() => expect(submitTaskFeedback).toHaveBeenCalled())
    expect(submitTaskFeedback.mock.calls.at(-1)![0].resolution).toEqual({
      action: "cadence", scheduleType: "seasonal", intervalDays: null, season: "spring",
    })
  })
})
