/**
 * Deep Clean setup: a late reply never lands on the wrong home (H4).
 *
 * The room picker's read applied whatever came back, so home A's slow read,
 * answering after a switch to home B, put A's rooms in B's picker. A switch
 * also kept A's selection — A's default room stayed selected under B, so a
 * session started from it filtered B's tasks by A's room. And "Let's clean"
 * read the tasks for one home and opened the checklist with them even if the
 * person had switched homes meanwhile.
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
}))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: svc.homeId } }),
  getRooms: (...a: unknown[]) => svc.getRooms(...a),
}))
vi.mock("@/modules/care", () => ({ markTaskInstanceDone: vi.fn() }))
vi.mock("@/lib/cleanSession", () => ({
  getDeepCleanGuides: (...a: unknown[]) => svc.getDeepCleanGuides(...a),
  getCleaningTasks: (...a: unknown[]) => svc.getCleaningTasks(...a),
  saveRoutineTask: vi.fn(),
}))

const { default: DeepClean } = await import("./DeepClean")

type RoomsRead = { data: { room_id: string; name: string }[]; error: null }
const ROOMS: Record<string, RoomsRead> = {
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

beforeEach(() => {
  vi.clearAllMocks()
  svc.homeId = "home-a"
  svc.getDeepCleanGuides.mockResolvedValue([])
  svc.getCleaningTasks.mockImplementation(async (homeId: string) => TASKS[homeId])
  svc.getRooms.mockImplementation(async (homeId: string) => ROOMS[homeId])
})

describe("Deep Clean setup — a late reply for the last home lands nowhere", () => {
  it("home A's slow rooms, answering after the switch to B, leave B's rooms in the picker", async () => {
    const slowA = deferred<RoomsRead>()
    svc.getRooms.mockImplementation((homeId: string) => (homeId === "home-a" ? slowA.promise : Promise.resolve(ROOMS[homeId])))
    const { rerender } = render(page())
    switchTo("home-b", rerender)
    fireEvent.click(await screen.findByText("Start cleaning"))
    expect(await screen.findByRole("button", { name: "Garage" })).toBeInTheDocument()

    await act(async () => { slowA.resolve(ROOMS["home-a"]) })
    expect(screen.getByRole("button", { name: "Garage" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Kitchen" })).toBeNull()
  })

  it("after a switch, the new home's own default room is the one a session cleans", async () => {
    const { rerender } = render(page())
    fireEvent.click(await screen.findByText("Start cleaning"))
    expect(await screen.findByRole("button", { name: "Kitchen" })).toBeInTheDocument()

    switchTo("home-b", rerender)
    expect(await screen.findByRole("button", { name: "Garage" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: "Let's clean →" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Let's clean →" }))

    expect(await screen.findByText("Sweep the garage floor")).toBeInTheDocument()
    expect(svc.getCleaningTasks).toHaveBeenLastCalledWith("home-b", "cleaning")
  })

  it("Let's clean for A, answering after the switch to B, does not open A's checklist on B", async () => {
    const slowTasks = deferred<CleanTask[]>()
    svc.getCleaningTasks.mockImplementation((homeId: string) =>
      homeId === "home-a" ? slowTasks.promise : Promise.resolve(TASKS[homeId]))
    const { rerender } = render(page())
    fireEvent.click(await screen.findByText("Start cleaning"))
    await waitFor(() => expect(screen.getByRole("button", { name: "Let's clean →" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Let's clean →" }))

    switchTo("home-b", rerender)
    expect(await screen.findByRole("button", { name: "Garage" })).toBeInTheDocument()

    await act(async () => { slowTasks.resolve(TASKS["home-a"]) })
    expect(screen.queryByText("Wipe the oven door")).toBeNull()
    // Still B's setup, ready for B — not stuck on "Loading…".
    expect(screen.getByRole("button", { name: "Let's clean →" })).toBeEnabled()
  })
})
