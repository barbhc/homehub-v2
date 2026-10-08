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
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/modules/home", () => ({ upsertHomeProfile: vi.fn() }))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFeedbackContext: (...a: unknown[]) => getFeedbackContext(...a),
  submitTaskFeedback: vi.fn(),
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
  it("clear, type 6 → 6", async () => {
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
  })
})
