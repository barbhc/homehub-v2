/**
 * Tasks → Cleaning (CleaningView, what was the Deep Clean page): the hub's
 * read, what the hub no longer shows, and the summary's message.
 *
 * Two H5 (whole-app lint) restructures:
 *  - the hub's "Loading…" was set inside the effect that reads; it is now set
 *    in the render that asks (useDepsChanged) — pinned: a failed read says so,
 *    and Try again shows Loading, then the guides;
 *  - the summary's encouragement was drawn with Math.random() DURING RENDER,
 *    so any re-render could swap it (react-hooks/purity); it is now picked once
 *    when the session finishes — pinned: one message per finish, kept across
 *    re-renders.
 *
 * And from the Tasks + Items views change (design/tasks-items-views.md): Clean's
 * own "This week" list is gone — the week is one list, in Upkeep — so the hub
 * neither renders it nor reads the cleaning tasks it was built from.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SWRConfig } from "swr"
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

const { CleaningView } = await import("./DeepClean")
/** A fresh cache per render tree; the guides are read through SWR (useCleaningGuides). */
const SWR = { provider: () => new Map(), shouldRetryOnError: false }

const GUIDE: DeepCleanGuide = { id: "g1", title: "Clean the Bosch 800 Series Dishwasher", estimatedMinutes: 20, itemUnitId: "i1" }
const TASK: CleanTask = {
  id: "t1", source: "instance", title: "Wipe the oven door", description: null, instructions: null,
  itemUnitId: null, itemName: null, roomId: "r1", roomName: "Kitchen", dueDate: null, estimatedMinutes: 10,
  scheduleType: "weekly", lastCompletedDate: null, staleDays: 3, priorityScore: 5, isOverdue: false,
}
const page = () => (
  <SWRConfig value={SWR}>
    <MemoryRouter>
      <CleaningView />
    </MemoryRouter>
  </SWRConfig>
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

    let finish!: (g: DeepCleanGuide[]) => void
    svc.getDeepCleanGuides.mockReturnValueOnce(new Promise((r) => { finish = r }))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Loading…")).toBeInTheDocument())
    expect(screen.queryByText("Couldn't load your cleaning guides.")).toBeNull()
    await act(async () => { finish([GUIDE]) })
    expect(screen.getByText(GUIDE.title)).toBeInTheDocument()
  })

  it("has no 'This week' list of its own (not rendered) and does not read the cleaning tasks one was built from", async () => {
    render(page())
    expect(await screen.findByText(GUIDE.title)).toBeInTheDocument()
    expect(screen.getByText("Start cleaning")).toBeInTheDocument()
    expect(screen.queryByText("This week")).toBeNull()
    expect(screen.queryByText(TASK.title)).toBeNull()
    expect(screen.queryByText(/Nothing due this week/)).toBeNull()
    // The checklist reads them when a session starts — the hub does not.
    expect(svc.getCleaningTasks).not.toHaveBeenCalled()
    // Nor its own "Clean" title: the page's title is "Tasks", above the control.
    expect(screen.queryByRole("heading", { name: "Clean" })).toBeNull()
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
