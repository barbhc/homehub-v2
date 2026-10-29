/**
 * HH-166: the feedback sheet's "My home doesn't freeze" door.
 *
 * It already offers the other winterizing tasks (all ticked) and turns them off
 * through submitTaskFeedback — the same suppress + freeze_prep rule the
 * Settings climate offer now uses, so both doors reach one result. What it did
 * NOT do was look at its climate write: `await upsertHomeProfile(...)` with the
 * result dropped, so a climate that never landed read as done — the "save
 * that never landed" the owner's "Usually autumn" pointed at.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const getFeedbackContext = vi.hoisted(() => vi.fn())
const submitTaskFeedback = vi.hoisted(() => vi.fn())
const upsertHomeProfile = vi.hoisted(() => vi.fn())
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/modules/home", () => ({ upsertHomeProfile: (...a: unknown[]) => upsertHomeProfile(...a) }))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFeedbackContext: (...a: unknown[]) => getFeedbackContext(...a),
  submitTaskFeedback: (...a: unknown[]) => submitTaskFeedback(...a),
  discussTask: vi.fn(),
}))

const { TaskFeedbackSheet } = await import("./TaskFeedbackSheet")

const FREEZE_PREP = { by: "seasonalFamily", family: "freeze_prep" }

async function applyFreezeFree() {
  render(
    <MemoryRouter>
      <TaskFeedbackSheet
        open
        homeId="h1" taskTemplateId="t-washer" taskInstanceId="i1" title="Winterize the washer for cold storage"
        tier="recommended" onClose={vi.fn()} onApplied={vi.fn()}
      />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText("Not relevant to my home"))
  fireEvent.click(screen.getByRole("button", { name: "Continue" }))
  await screen.findByText("Winterize the Dishwasher")
  fireEvent.click(screen.getByText("My home doesn't freeze — skip winterizing on future scans too"))
  fireEvent.click(screen.getByRole("button", { name: "Apply to 2 tasks" }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getFeedbackContext.mockResolvedValue({
    data: { primary: {}, match: FREEZE_PREP, similar: [{ taskTemplateId: "t-dish", title: "Winterize the Dishwasher" }] },
    error: null,
  })
  submitTaskFeedback.mockResolvedValue({ data: { feedbackId: "f1", ruleId: "r1", affected: 2 }, error: null })
})

describe("TaskFeedbackSheet · My home doesn't freeze", () => {
  it("turns the winterizing tasks off the same way the Settings offer does", async () => {
    upsertHomeProfile.mockResolvedValue({ data: { climate: "mild", freeze_risk: false }, error: null })
    await applyFreezeFree()
    await screen.findByText("Thanks — done")
    expect(submitTaskFeedback).toHaveBeenCalledWith(expect.objectContaining({
      chip: "not_relevant",
      resolution: { action: "suppress" },
      match: FREEZE_PREP,
      sweepTemplateIds: ["t-dish"],
    }))
    expect(upsertHomeProfile).toHaveBeenCalledWith("h1", { climate: "mild", freeze_risk: false })
    expect(screen.queryByText(/climate didn't save/)).toBeNull()
  })

  it("a failed climate write is said, not swallowed", async () => {
    upsertHomeProfile.mockResolvedValue({ data: null, error: { message: "Failed to save home profile" } })
    await applyFreezeFree()
    await screen.findByText("Thanks — done")
    await waitFor(() =>
      expect(screen.getByText(/Your climate didn't save, so new manuals may still add winterizing/)).toBeInTheDocument(),
    )
  })
})
