/**
 * The task page answers for the task in the URL (H4).
 *
 * /tasks/A → /tasks/B keeps the page mounted (a push tap for another task, the
 * cross-home one included, lands exactly like this). Its reads were per task,
 * but not everything that answered was: the re-read after an edit is saved
 * put whatever came back on screen, so task A's re-read answering after the
 * move showed A under B's URL — where Mark done acts on B. And until B's read
 * came back the page went on showing A, with A's done/assign state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"

const svc = vi.hoisted(() => ({
  getTaskDetail: vi.fn(),
  queued: new Map<string, Promise<unknown>[]>(),
}))
vi.mock("@/modules/care", async () => {
  const dates = await vi.importActual<typeof import("@/modules/care/services/nextDueDate")>(
    "@/modules/care/services/nextDueDate",
  )
  return {
    getTaskDetail: (...a: unknown[]) => svc.getTaskDetail(...a),
    markTaskInstanceDone: vi.fn(),
    assignTaskInstance: vi.fn(),
    setTaskReminder: vi.fn(),
    canAssignTasks: (n: number) => n > 1,
    computeNextDueDate: dates.computeNextDueDate,
  }
})
vi.mock("@/modules/home", () => {
  const ctx = { home: { home_id: "home-1", name: "Home" } }
  return {
    useCurrentHome: () => ctx,
    getHomeMembers: vi.fn(async () => ({ data: [], error: null })),
  }
})
vi.mock("@/modules/knowledge", () => ({ getManualsByItem: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/hooks/useManualManagement", () => ({ resolveManualUrl: vi.fn() }))
vi.mock("@/components/care/TaskFeedbackSheet", () => ({ TaskFeedbackSheet: () => null }))
vi.mock("@/components/care/ManualDockPanel", () => ({ ManualDockPanel: () => null }))
vi.mock("@/components/tasks/HowToSteps", () => ({ HowToSteps: () => null }))
vi.mock("@/components/item-care/SupplyRows", () => ({ SupplyRows: () => null }))
// The edit sheet as a stand-in: its Save is all this needs.
vi.mock("@/components/tasks/TaskEditSheet", () => ({
  TaskEditSheet: (p: { onSaved: () => void }) => <button type="button" onClick={p.onSaved}>edit saved</button>,
}))

const { default: TaskDetail } = await import("./TaskDetail")

const detail = (id: string, title: string) => ({
  taskInstanceId: id, taskTemplateId: `tpl-${id}`, title, tier: "essential", careType: "maintenance",
  justification: null, estimatedMinutes: 10, dueDate: "2026-09-29", assignedTo: null, notes: null,
  steps: null, supplies: [], scheduleType: "monthly", intervalDays: null, neverCompleted: false,
  manualPage: null, itemUnitId: null, itemName: null, roomName: null,
  schedule: { scheduleType: "monthly", intervalDays: null, season: null }, remindEnabled: null,
})
type DetailRead = { data: ReturnType<typeof detail>; error: null }
const DETAILS: Record<string, DetailRead> = {
  "task-a": { data: detail("task-a", "Replace the furnace filter"), error: null },
  "task-b": { data: detail("task-b", "Clean the dryer vent"), error: null },
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
function holdNextRead(taskId: string) {
  const d = deferred<DetailRead>()
  svc.queued.set(taskId, [...(svc.queued.get(taskId) ?? []), d.promise])
  return d
}

function GoToTaskB() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate("/tasks/task-b")}>open task b</button>
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/tasks/task-a"]}>
      <GoToTaskB />
      <Routes>
        <Route path="/tasks/:taskInstanceId" element={<TaskDetail />} />
      </Routes>
    </MemoryRouter>,
  )
const heading = () => screen.queryByRole("heading", { level: 1 })?.textContent ?? null

beforeEach(() => {
  vi.clearAllMocks()
  svc.queued.clear()
  svc.getTaskDetail.mockImplementation((_h: string, id: string) => svc.queued.get(id)?.shift() ?? Promise.resolve(DETAILS[id]))
})

describe("TaskDetail — a late reply for the last task lands nowhere", () => {
  it("task A's re-read after an edit, answering after the move to task B, leaves B on screen", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "Replace the furnace filter" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Edit task" }))
    const reread = holdNextRead("task-a")
    fireEvent.click(screen.getByRole("button", { name: "edit saved" }))

    fireEvent.click(screen.getByRole("button", { name: "open task b" }))
    expect(await screen.findByRole("heading", { name: "Clean the dryer vent" })).toBeInTheDocument()

    await act(async () => { reread.resolve(DETAILS["task-a"]) })
    expect(heading()).toBe("Clean the dryer vent")
  })

  it("moving to task B shows B loading — never A under B's URL", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "Replace the furnace filter" })).toBeInTheDocument()
    const slowB = holdNextRead("task-b")

    fireEvent.click(screen.getByRole("button", { name: "open task b" }))
    expect(screen.queryByRole("heading", { name: "Replace the furnace filter" })).toBeNull()

    await act(async () => { slowB.resolve(DETAILS["task-b"]) })
    expect(heading()).toBe("Clean the dryer vent")
  })
})
