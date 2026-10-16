/**
 * HH-166 (owner): "Why is there a winterize washer task when I stated that I
 * live in a mild climate?"
 *
 * Two failures, both pinned here against the approved mock (artifact
 * RTek4RpQaskqjzv8ACtxTo, "build both" 2026-10-16):
 *
 *   1. The climate answer only filtered manuals scanned AFTER it. Saving Mild
 *      or Hot now lists the winterizing tasks the home already has, all
 *      ticked, with "Turn off N" and "Keep them" — and turns off only what she
 *      confirms. A failure keeps the card and says so.
 *   2. Her task read "Usually autumn", the phrase for a home with NO climate.
 *      A save is only "Saved" when the home doc read back carries the climate
 *      that was written; a failed write says so too.
 */
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const getHomeProfile = vi.hoisted(() => vi.fn())
const upsertHomeProfile = vi.hoisted(() => vi.fn())
const getWinterizingTasks = vi.hoisted(() => vi.fn())
const turnOffWinterizingTasks = vi.hoisted(() => vi.fn())
const undoTurnOffWinterizing = vi.hoisted(() => vi.fn())
vi.mock("@/modules/home", () => ({
  getHomeProfile: (...a: unknown[]) => getHomeProfile(...a),
  upsertHomeProfile: (...a: unknown[]) => upsertHomeProfile(...a),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/modules/care", () => ({
  getWinterizingTasks: (...a: unknown[]) => getWinterizingTasks(...a),
  turnOffWinterizingTasks: (...a: unknown[]) => turnOffWinterizingTasks(...a),
  undoTurnOffWinterizing: (...a: unknown[]) => undoTurnOffWinterizing(...a),
}))

const { HomeProfileSection } = await import("./HomeProfileSection")

const profile = (climate: string | null, freeze_risk: boolean | null) => ({
  home_type: "condo", ownership: "own", ownership_duration: "5_plus", climate, freeze_risk,
  top_concerns: [], preferred_mode: "unset", completed_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
})

const TASKS = [
  { taskTemplateId: "t-washer", title: "Winterize the washer for cold storage", where: "Washer", cadence: "When needed" },
  { taskTemplateId: "t-dish", title: "Winterize the Dishwasher", where: "Bosch dishwasher", cadence: "Seasonal" },
]

const TURNED_OFF_ONE = {
  feedbackId: "f1", ruleId: "r1", affected: 1, templateIds: ["t-washer"], instanceIds: ["i-washer"],
}

const OPTION: Record<string, string> = {
  mild: "Mild — rarely freezes", moderate: "Moderate — some frost", cold: "Cold — hard freezes", hot: "Hot / arid",
}
const FREEZE_RISK: Record<string, boolean> = { mild: false, hot: false, moderate: true, cold: true }

/** Load a profile whose climate is `from`, pick `to` in the select (unless it's the same), and Save. */
async function renderAndSave(to: string, from: string | null = null) {
  getHomeProfile.mockResolvedValue({ data: profile(from, from ? FREEZE_RISK[from] : null), error: null })
  render(<HomeProfileSection homeId="home-1" />)
  await screen.findByRole("button", { name: "Save" })
  if (to !== from) {
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Local climate" }))
    await user.click(await screen.findByRole("option", { name: OPTION[to] }))
  }
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
}

// Radix Select measures and captures the pointer; jsdom implements neither.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  getHomeProfile.mockReset()
  upsertHomeProfile.mockReset()
  getWinterizingTasks.mockReset()
  turnOffWinterizingTasks.mockReset()
  undoTurnOffWinterizing.mockReset()
  upsertHomeProfile.mockImplementation(async (_h: string, patch: { climate: string; freeze_risk: boolean }) => ({
    data: profile(patch.climate, patch.freeze_risk), error: null,
  }))
  getWinterizingTasks.mockResolvedValue({ data: TASKS, error: null })
})

describe("Settings › Home profile · climate hint", () => {
  it("says it also covers the tasks you already have", async () => {
    getHomeProfile.mockResolvedValue({ data: profile("mild", false), error: null })
    render(<HomeProfileSection homeId="home-1" />)
    expect(
      await screen.findByText("A mild or hot climate skips winterizing tasks in new manuals, and offers to turn off the ones you already have."),
    ).toBeInTheDocument()
  })
})

describe("Settings › Home profile · the winterizing offer after a Mild/Hot save", () => {
  it("lists the home's winterizing tasks, all ticked, with where · cadence", async () => {
    await renderAndSave("mild")
    const card = await screen.findByTestId("winterizing-offer")
    expect(getWinterizingTasks).toHaveBeenCalledWith("home-1")
    expect(within(card).getByText("You have 2 winterizing tasks")).toBeInTheDocument()
    expect(within(card).getByText("Homes that rarely freeze don't need them. Turn off the ones you don't want; nothing is deleted.")).toBeInTheDocument()
    expect(within(card).getByText("Washer · When needed")).toBeInTheDocument()
    expect(within(card).getByText("Bosch dishwasher · Seasonal")).toBeInTheDocument()
    const boxes = within(card).getAllByRole("checkbox")
    expect(boxes).toHaveLength(2)
    for (const b of boxes) expect(b).toBeChecked()
    expect(within(card).getByRole("button", { name: "Turn off 2" })).toBeEnabled()
    expect(within(card).getByRole("button", { name: "Keep them" })).toBeEnabled()
    // Nothing is turned off by the save itself.
    expect(turnOffWinterizingTasks).not.toHaveBeenCalled()
  })

  it("turns off only the ticked ones, then says so in the UndoBar", async () => {
    turnOffWinterizingTasks.mockResolvedValue({ data: TURNED_OFF_ONE, error: null })
    await renderAndSave("hot")
    const card = await screen.findByTestId("winterizing-offer")
    fireEvent.click(within(card).getByRole("checkbox", { name: /Winterize the Dishwasher/ }))
    fireEvent.click(within(card).getByRole("button", { name: "Turn off 1" }))
    const bar = await screen.findByRole("status")
    expect(bar).toHaveTextContent("Turned off 1 winterizing task")
    expect(within(bar).getByRole("button", { name: "Undo" })).toBeInTheDocument()
    expect(turnOffWinterizingTasks).toHaveBeenCalledWith("home-1", "u1", [TASKS[0]])
    expect(screen.queryByTestId("winterizing-offer")).toBeNull()
  })

  it("Undo puts back exactly what was turned off", async () => {
    turnOffWinterizingTasks.mockResolvedValue({ data: TURNED_OFF_ONE, error: null })
    undoTurnOffWinterizing.mockResolvedValue({ data: true, error: null })
    await renderAndSave("mild")
    const card = await screen.findByTestId("winterizing-offer")
    fireEvent.click(within(card).getByRole("checkbox", { name: /Winterize the Dishwasher/ }))
    fireEvent.click(within(card).getByRole("button", { name: "Turn off 1" }))
    fireEvent.click(within(await screen.findByRole("status")).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Turned 1 winterizing task back on"))
    expect(undoTurnOffWinterizing).toHaveBeenCalledWith("home-1", TURNED_OFF_ONE)
  })

  it("a failed Undo says so, stays up, and Undo tries again", async () => {
    turnOffWinterizingTasks.mockResolvedValue({ data: TURNED_OFF_ONE, error: null })
    undoTurnOffWinterizing
      .mockResolvedValueOnce({ data: null, error: { message: "Missing or insufficient permissions." } })
      .mockResolvedValueOnce({ data: true, error: null })
    await renderAndSave("mild")
    const card = await screen.findByTestId("winterizing-offer")
    fireEvent.click(within(card).getByRole("checkbox", { name: /Winterize the Dishwasher/ }))
    fireEvent.click(within(card).getByRole("button", { name: "Turn off 1" }))
    fireEvent.click(within(await screen.findByRole("status")).getByRole("button", { name: "Undo" }))
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Couldn't turn them back on: Missing or insufficient permissions. Tap Undo to try again."),
    )
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Turned 1 winterizing task back on"))
    expect(undoTurnOffWinterizing).toHaveBeenCalledTimes(2)
  })

  it("a failed turn-off says so and keeps the card, ticks intact", async () => {
    turnOffWinterizingTasks.mockResolvedValue({ data: null, error: { message: "Missing or insufficient permissions." } })
    await renderAndSave("mild")
    const card = await screen.findByTestId("winterizing-offer")
    fireEvent.click(within(card).getByRole("button", { name: "Turn off 2" }))
    expect(await within(card).findByText("Couldn't turn them off: Missing or insufficient permissions.")).toBeInTheDocument()
    expect(screen.getByTestId("winterizing-offer")).toBeInTheDocument()
    for (const b of within(card).getAllByRole("checkbox")) expect(b).toBeChecked()
    expect(screen.queryByText(/^Turned off/)).toBeNull()
  })

  it("Keep them leaves everything and closes the card", async () => {
    await renderAndSave("mild")
    const card = await screen.findByTestId("winterizing-offer")
    fireEvent.click(within(card).getByRole("button", { name: "Keep them" }))
    expect(screen.queryByTestId("winterizing-offer")).toBeNull()
    expect(turnOffWinterizingTasks).not.toHaveBeenCalled()
  })

  it("a home that freezes is not offered anything", async () => {
    await renderAndSave("moderate")
    await screen.findByText("Saved")
    expect(getWinterizingTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId("winterizing-offer")).toBeNull()
  })

  it("re-saving the profile without changing the climate offers nothing", async () => {
    await renderAndSave("mild", "mild")
    await screen.findByText("Saved")
    expect(getWinterizingTasks).not.toHaveBeenCalled()
    expect(screen.queryByTestId("winterizing-offer")).toBeNull()
  })

  it("a change FROM a freezing climate to Mild offers", async () => {
    await renderAndSave("mild", "moderate")
    expect(await screen.findByTestId("winterizing-offer")).toBeInTheDocument()
    expect(upsertHomeProfile).toHaveBeenCalledWith("home-1", expect.objectContaining({ climate: "mild", freeze_risk: false }), expect.anything())
  })

  it("no winterizing tasks, no card", async () => {
    getWinterizingTasks.mockResolvedValue({ data: [], error: null })
    await renderAndSave("mild")
    await waitFor(() => expect(getWinterizingTasks).toHaveBeenCalled())
    expect(screen.queryByTestId("winterizing-offer")).toBeNull()
  })
})

describe("Settings › Home profile · a climate save that never landed", () => {
  it("a failed profile write surfaces an error, not Saved, and offers nothing", async () => {
    upsertHomeProfile.mockResolvedValue({ data: null, error: { message: "Failed to save home profile" } })
    await renderAndSave("mild")
    expect(await screen.findByText("Failed to save home profile")).toBeInTheDocument()
    expect(screen.queryByText("Saved")).toBeNull()
    expect(getWinterizingTasks).not.toHaveBeenCalled()
  })

  it("a write that reads back WITHOUT the climate is an error, not Saved", async () => {
    upsertHomeProfile.mockResolvedValue({ data: profile(null, null), error: null })
    await renderAndSave("mild")
    expect(await screen.findByText("Your climate didn't save. Try again.")).toBeInTheDocument()
    expect(screen.queryByText("Saved")).toBeNull()
    expect(getWinterizingTasks).not.toHaveBeenCalled()
  })
})
