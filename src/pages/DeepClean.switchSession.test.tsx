/**
 * Deep Clean: a session under way for one home never crosses a home switch.
 *
 * A checklist in progress for home A survived a switch to home B — A's tasks
 * still listed, A's ticks still held — and "Finish" then called
 * markTaskInstanceDone(B's home id, A's task ids). A summary for A (with its
 * "Save these to your routine?") stayed on B the same way, and a Finish or
 * Save sent for A, landing after the switch, opened A's summary on B.
 *
 * Now the switch ends A's session in the render that switches: B opens on its
 * own setup, and every id a Finish can send is the current home's. What was
 * already sent for A still goes to A (its own home id with its own ids) and
 * shows nothing on B.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CleanTask } from "@/lib/cleanSession"

const svc = vi.hoisted(() => ({
  homeId: "home-a",
  getDeepCleanGuides: vi.fn(),
  getCleaningTasks: vi.fn(),
  getRooms: vi.fn(),
  markTaskInstanceDone: vi.fn(),
  saveRoutineTask: vi.fn(),
}))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: svc.homeId } }),
  getRooms: (...a: unknown[]) => svc.getRooms(...a),
}))
vi.mock("@/modules/care", () => ({ markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a) }))
vi.mock("@/lib/cleanSession", () => ({
  getDeepCleanGuides: (...a: unknown[]) => svc.getDeepCleanGuides(...a),
  getCleaningTasks: (...a: unknown[]) => svc.getCleaningTasks(...a),
  saveRoutineTask: (...a: unknown[]) => svc.saveRoutineTask(...a),
}))

const { default: DeepClean } = await import("./DeepClean")

const ROOMS: Record<string, { data: { room_id: string; name: string }[]; error: null }> = {
  "home-a": { data: [{ room_id: "ka", name: "Kitchen" }], error: null },
  "home-b": { data: [{ room_id: "gb", name: "Garage" }], error: null },
}
const task = (id: string, title: string, roomId: string): CleanTask => ({
  id, source: "instance", title, description: null, instructions: null,
  itemUnitId: null, itemName: null, roomId, roomName: null, dueDate: null, estimatedMinutes: 10,
  scheduleType: "weekly", lastCompletedDate: null, staleDays: 3, priorityScore: 5, isOverdue: false,
})
const TASKS: Record<string, CleanTask[]> = {
  "home-a": [task("ta", "Wipe the oven door", "ka")],
  "home-b": [task("tb", "Sweep the garage floor", "gb")],
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const page = () => <MemoryRouter><DeepClean /></MemoryRouter>
const switchTo = (homeId: string, rerender: (ui: React.ReactElement) => void) => {
  svc.homeId = homeId
  rerender(page())
}

/** Hub → setup → the checklist for whichever home is on screen. */
async function openChecklist(firstTask: string) {
  fireEvent.click(await screen.findByText("Start cleaning"))
  await letsClean(firstTask)
}
async function letsClean(firstTask: string) {
  await waitFor(() => expect(screen.getByRole("button", { name: "Let's clean →" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "Let's clean →" }))
  expect(await screen.findByText(firstTask)).toBeInTheDocument()
}
/** B's setup, ready to start B's own session. */
async function expectHomeBSetup() {
  expect(await screen.findByRole("button", { name: "Garage" })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole("button", { name: "Let's clean →" })).toBeEnabled())
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.homeId = "home-a"
  svc.getDeepCleanGuides.mockResolvedValue([])
  svc.getCleaningTasks.mockImplementation(async (homeId: string) => TASKS[homeId])
  svc.getRooms.mockImplementation(async (homeId: string) => ROOMS[homeId])
  svc.markTaskInstanceDone.mockResolvedValue({ success: true, data: null })
  svc.saveRoutineTask.mockResolvedValue({ task_template_id: "saved" })
})

describe("Deep Clean — a session never crosses a home switch", () => {
  it("A's checklist, ticked, ends on the switch to B: Finish can only send B's ids, under B", async () => {
    const { rerender } = render(page())
    await openChecklist("Wipe the oven door")
    fireEvent.click(screen.getByRole("checkbox"))
    expect(screen.getByText("1 tasks selected")).toBeInTheDocument()

    switchTo("home-b", rerender)

    // Nothing of A's session is left to finish under B.
    expect(screen.queryByText("Wipe the oven door")).toBeNull()
    expect(screen.queryByRole("button", { name: "Finish session →" })).toBeNull()
    await expectHomeBSetup()

    // B's own session marks B's own task, under B — and nothing else, ever.
    await letsClean("Sweep the garage floor")
    expect(screen.getByText("0 tasks selected")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: "Finish session →" }))
    expect(await screen.findByText(/1 of 1 tasks completed/)).toBeInTheDocument()
    expect(svc.markTaskInstanceDone.mock.calls).toEqual([["home-b", "tb"]])
  })

  it("the hub no longer offers to resume A's session after the switch", async () => {
    const { rerender } = render(page())
    await openChecklist("Wipe the oven door")

    switchTo("home-b", rerender)
    await expectHomeBSetup()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(await screen.findByText("Start cleaning")).toBeInTheDocument()
    expect(screen.queryByText("Resume session")).toBeNull()
  })

  it("a Finish for A still saving when the switch lands goes to A, and puts neither A's summary nor A's failure on B", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const finishA = deferred<{ success: false; error: string }>()
    svc.markTaskInstanceDone.mockReturnValue(finishA.promise)
    const { rerender } = render(page())
    await openChecklist("Wipe the oven door")
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: "Finish session →" }))
    expect(screen.getByRole("button", { name: "Finishing…" })).toBeDisabled()

    switchTo("home-b", rerender)
    await expectHomeBSetup()

    await act(async () => { finishA.resolve({ success: false, error: "unavailable" }) })

    // A's check-off was A's: its own home id with its own task id.
    expect(svc.markTaskInstanceDone.mock.calls).toEqual([["home-a", "ta"]])
    // B is still on its own setup — no summary, no "couldn't be saved" for A.
    expect(screen.queryByText(/tasks completed/)).toBeNull()
    expect(screen.queryByText(/couldn't be saved/)).toBeNull()
    expect(screen.getByRole("button", { name: "Garage" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Let's clean →" })).toBeEnabled()
    // Not shown on B, still not silent.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("home-a"), ["unavailable"])
  })

  it("A's summary, with a typed task still to save, ends on the switch — Save can't put A's task in B's routine", async () => {
    const { rerender } = render(page())
    await openChecklist("Wipe the oven door")
    fireEvent.change(screen.getByPlaceholderText("Add a task..."), { target: { value: "Dust the blinds" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish session →" }))
    expect(await screen.findByText("Save these to your routine?")).toBeInTheDocument()
    expect(screen.getByText("Dust the blinds")).toBeInTheDocument()

    switchTo("home-b", rerender)

    expect(screen.queryByText("Save these to your routine?")).toBeNull()
    expect(screen.queryByText("Dust the blinds")).toBeNull()
    await expectHomeBSetup()
    expect(svc.saveRoutineTask).not.toHaveBeenCalled()
  })

  it("a Save for A's typed task, failing after the switch, says nothing on B", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const saveA = deferred<{ error: string }>()
    svc.saveRoutineTask.mockReturnValue(saveA.promise)
    const { rerender } = render(page())
    await openChecklist("Wipe the oven door")
    fireEvent.change(screen.getByPlaceholderText("Add a task..."), { target: { value: "Dust the blinds" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish session →" }))
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))

    switchTo("home-b", rerender)
    await expectHomeBSetup()
    await act(async () => { saveA.resolve({ error: "unavailable" }) })

    expect(svc.saveRoutineTask).toHaveBeenCalledWith("home-a", "Dust the blinds", "monthly", null)
    expect(screen.queryByText(/Couldn.t save/)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("home-a"), "unavailable")

    // B's own session starts clean, and B's own summary carries nothing of A's.
    await letsClean("Sweep the garage floor")
    expect(screen.queryByText("Dust the blinds")).toBeNull()
    fireEvent.change(screen.getByPlaceholderText("Add a task..."), { target: { value: "Oil the hinges" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish session →" }))
    expect(await screen.findByText("Save these to your routine?")).toBeInTheDocument()
    expect(screen.getByText("Oil the hinges")).toBeInTheDocument()
    expect(screen.queryByText(/Couldn.t save/)).toBeNull()
  })
})
