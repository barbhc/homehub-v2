/**
 * Your own tasks: a late reply never lands on the wrong home (H4).
 *
 * Moved here with the list from Settings.staleReply.test.tsx, with Your
 * home's "her own task, answered after the switch" case (49b6ebf). The list is
 * read by one function and lands through one apply — on arrival, on a home
 * switch, on Try again, and in the re-read after an add. Home A's slow read,
 * landing after a switch to home B, used to replace B's list with A's; and an
 * add started on A, answering on B, said "Added" there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const m = vi.hoisted(() => ({
  homeId: "home-a",
  getRoutineTemplates: vi.fn(),
  saveRoutineTask: vi.fn(),
  deleteRoutineTask: vi.fn(),
  addCustomHomeTask: vi.fn(),
}))

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: m.homeId, name: m.homeId } }) }))
vi.mock("@/lib/cleanSession", () => ({
  getRoutineTemplates: (...a: unknown[]) => m.getRoutineTemplates(...a),
  saveRoutineTask: (...a: unknown[]) => m.saveRoutineTask(...a),
  deleteRoutineTask: (...a: unknown[]) => m.deleteRoutineTask(...a),
}))
vi.mock("@/modules/care", () => ({ addCustomHomeTask: (...a: unknown[]) => m.addCustomHomeTask(...a) }))

const { default: OwnTasksPage } = await import("@/pages/OwnTasksPage")

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const routine = (id: string, title: string) => ({ task_template_id: id, title, schedule_type: "weekly", estimated_minutes: null })
const ROUTINES: Record<string, ReturnType<typeof routine>[]> = {
  "home-a": [routine("ra", "Water the ferns")],
  "home-b": [routine("rb", "Clear the gutters")],
}

const page = () => <MemoryRouter><OwnTasksPage /></MemoryRouter>
const tasksCard = () => within(document.querySelector("[data-testid=own-tasks-page]") as HTMLElement)
const readsOf = (homeId: string) => m.getRoutineTemplates.mock.calls.filter(([h]) => h === homeId).length

beforeEach(() => {
  vi.clearAllMocks()
  m.homeId = "home-a"
  m.getRoutineTemplates.mockImplementation(async (homeId: string) => ROUTINES[homeId])
})

describe("Your own tasks — a late reply for the last home lands nowhere", () => {
  it("home A's slow first read, answering after the switch to B, leaves B's list", async () => {
    const slowA = deferred<ReturnType<typeof routine>[]>()
    m.getRoutineTemplates.mockImplementation((homeId: string) =>
      homeId === "home-a" ? slowA.promise : Promise.resolve(ROUTINES[homeId]))
    const { rerender } = render(page())

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()

    await act(async () => { slowA.resolve(ROUTINES["home-a"]) })
    expect(tasksCard().getByText("Clear the gutters")).toBeInTheDocument()
    expect(tasksCard().queryByText("Water the ferns")).toBeNull()
  })

  it("Try again on A, answering after the switch to B, leaves B's list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const retryA = deferred<ReturnType<typeof routine>[]>()
    m.getRoutineTemplates
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockImplementation((homeId: string) => (homeId === "home-a" ? retryA.promise : Promise.resolve(ROUTINES[homeId])))
    const { rerender } = render(page())
    fireEvent.click(await tasksCard().findByRole("button", { name: "Try again" }))

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()

    await act(async () => { retryA.resolve(ROUTINES["home-a"]) })
    expect(tasksCard().getByText("Clear the gutters")).toBeInTheDocument()
    expect(tasksCard().queryByText("Water the ferns")).toBeNull()
  })

  it("a Cleaning add on A, finishing after the switch, neither spins, re-reads nor lands on B", async () => {
    const save = deferred<{ task_template_id: string }>()
    m.saveRoutineTask.mockReturnValue(save.promise)
    const { rerender } = render(page())
    expect(await tasksCard().findByText("Water the ferns")).toBeInTheDocument()

    fireEvent.change(tasksCard().getByLabelText("Task name"), { target: { value: "Sweep the deck" } })
    fireEvent.click(tasksCard().getByRole("radio", { name: "Cleaning" }))
    fireEvent.click(tasksCard().getByRole("button", { name: "Add task" }))

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()
    const readsOfB = readsOf("home-b")

    // A's add lands; it went to A, and B's page is not touched by it.
    await act(async () => { save.resolve({ task_template_id: "new-a" }) })
    await act(async () => {})
    expect(m.saveRoutineTask).toHaveBeenCalledWith("home-a", "Sweep the deck", "weekly", null)
    expect(tasksCard().queryByText("Loading…")).toBeNull()
    expect(tasksCard().getByText("Clear the gutters")).toBeInTheDocument()
    expect(tasksCard().queryByText("Water the ferns")).toBeNull()
    expect(readsOf("home-b")).toBe(readsOfB)
    expect(tasksCard().queryByRole("status")).toBeNull()
  })

  it("her own Upkeep task added on A, answered after the switch, neither refreshes B nor says “Added” there", async () => {
    const landA = deferred<{ data: { title: string } | null; error: { message: string } | null }>()
    m.addCustomHomeTask.mockReturnValue(landA.promise)
    const { rerender } = render(page())
    fireEvent.change(await tasksCard().findByLabelText("Task name"), { target: { value: "Have the chimney swept" } })
    fireEvent.change(tasksCard().getByLabelText("How often"), { target: { value: "annual" } })
    fireEvent.click(tasksCard().getByRole("button", { name: "Add task" }))

    m.homeId = "home-b"
    rerender(page())
    // B's form starts over: what was typed was for A.
    expect(await tasksCard().findByLabelText("Task name")).toHaveValue("")
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()
    const readsOfB = readsOf("home-b")
    await act(async () => { landA.resolve({ data: { title: "Have the chimney swept" }, error: null }) })

    expect(m.addCustomHomeTask).toHaveBeenCalledWith("home-a", "Have the chimney swept", "annual", null, null)
    expect(readsOf("home-b")).toBe(readsOfB)
    expect(tasksCard().queryByRole("status")).toBeNull()
    // B's Add is ready, not stuck on A's "Adding…".
    fireEvent.change(tasksCard().getByLabelText("Task name"), { target: { value: "Rake the leaves" } })
    expect(tasksCard().getByRole("button", { name: "Add task" })).toBeEnabled()
  })

  it("an add on A that FAILS after the switch says nothing on B — the failure is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const landA = deferred<{ data: null; error: { message: string } }>()
    m.addCustomHomeTask.mockReturnValue(landA.promise)
    const { rerender } = render(page())
    fireEvent.change(await tasksCard().findByLabelText("Task name"), { target: { value: "Have the chimney swept" } })
    fireEvent.click(tasksCard().getByRole("button", { name: "Add task" }))

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()
    await act(async () => { landA.resolve({ data: null, error: { message: "unavailable" } }) })

    expect(tasksCard().queryByRole("alert")).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("home home-a, answered after a switch"), "unavailable")
  })

  it("a delete on A the server refuses after the switch says nothing on B — the failure is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const landA = deferred<{ ok: boolean; error?: string }>()
    m.deleteRoutineTask.mockReturnValue(landA.promise)
    const { rerender } = render(page())
    fireEvent.click(await tasksCard().findByRole("button", { name: "Delete Water the ferns" }))

    m.homeId = "home-b"
    rerender(page())
    expect(await tasksCard().findByText("Clear the gutters")).toBeInTheDocument()
    await act(async () => { landA.resolve({ ok: false, error: "permission-denied" }) })

    expect(tasksCard().queryByRole("alert")).toBeNull()
    expect(tasksCard().getByRole("button", { name: "Delete Clear the gutters" })).toBeEnabled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("(home home-a), answered after a switch"), "permission-denied")
  })
})
