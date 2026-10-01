/**
 * Deep Clean: the hub's read, and the summary's message.
 *
 * Two H5 (whole-app lint) restructures:
 *  - the hub's "Loading…" was set inside the effect that reads; it is now set
 *    in the render that asks (useDepsChanged) — pinned: a failed read says so,
 *    and Try again shows Loading, then the guides;
 *  - the summary's encouragement was drawn with Math.random() DURING RENDER,
 *    so any re-render could swap it (react-hooks/purity); it is now picked once
 *    when the session finishes — pinned: one message per finish, kept across
 *    re-renders.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CleanTask, DeepCleanGuide } from "@/lib/cleanSession"

const svc = vi.hoisted(() => ({
  getDeepCleanGuides: vi.fn(),
  getCleaningTasks: vi.fn(),
  getRooms: vi.fn(),
  markTaskInstanceDone: vi.fn(),
}))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1" } }),
  getRooms: (...a: unknown[]) => svc.getRooms(...a),
}))
vi.mock("@/modules/care", () => ({ markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a) }))
vi.mock("@/lib/cleanSession", () => ({
  getDeepCleanGuides: (...a: unknown[]) => svc.getDeepCleanGuides(...a),
  getCleaningTasks: (...a: unknown[]) => svc.getCleaningTasks(...a),
  saveRoutineTask: vi.fn(),
}))

const { default: DeepClean } = await import("./DeepClean")

const GUIDE: DeepCleanGuide = { id: "g1", title: "Clean the Bosch 800 Series Dishwasher", estimatedMinutes: 20, itemUnitId: "i1" }
const TASK: CleanTask = {
  id: "t1", source: "instance", title: "Wipe the oven door", description: null, instructions: null,
  itemUnitId: null, itemName: null, roomId: "r1", roomName: "Kitchen", dueDate: null, estimatedMinutes: 10,
  scheduleType: "weekly", lastCompletedDate: null, staleDays: 3, priorityScore: 5, isOverdue: false,
}
const page = () => (
  <MemoryRouter>
    <DeepClean />
  </MemoryRouter>
)

describe("DeepClean", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    svc.getRooms.mockReset().mockResolvedValue({ data: [{ room_id: "r1", name: "Kitchen" }], error: null })
    svc.getDeepCleanGuides.mockReset().mockResolvedValue([GUIDE])
    svc.getCleaningTasks.mockReset().mockResolvedValue([TASK])
    svc.markTaskInstanceDone.mockReset().mockResolvedValue({ success: true })
  })

  it("a hub read that fails says so, and Try again shows Loading, then the guides", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    svc.getDeepCleanGuides.mockRejectedValueOnce(new Error("unavailable"))
    render(page())
    await waitFor(() => expect(screen.getByText("Couldn't load your cleaning guides.")).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0])
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByText(GUIDE.title)).toBeInTheDocument())
  })

  it("the summary's message is picked once, when the session finishes", async () => {
    // First draw → the first message; any later draw would be the last one.
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValue(0.99)
    const { rerender } = render(page())
    await waitFor(() => expect(screen.getByText("Start cleaning")).toBeInTheDocument())

    fireEvent.click(screen.getByText("Start cleaning"))
    await waitFor(() => expect(screen.getByRole("button", { name: "Let's clean →" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Let's clean →" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Finish session →" })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Finish session →" }))

    await waitFor(() => expect(screen.getByText("Well done!")).toBeInTheDocument())
    rerender(page())
    rerender(page())
    expect(screen.getByText("Well done!")).toBeInTheDocument()
    expect(screen.queryByText("You've got this.")).toBeNull()
  })
})
