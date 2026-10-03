/**
 * The task page when a read or a write fails (audit H6).
 *
 *  1. A read that failed rendered "Task not found." — the same sentence as a
 *     task that is genuinely gone, so a dropped connection read as a deletion.
 *  2. Assigning a task discarded the write's result: the new name stayed on
 *     screen whether or not it saved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"

const getTaskDetail = vi.fn()
const assignTaskInstance = vi.fn()
const getHomeMembers = vi.fn()

vi.mock("@/modules/care", async () => {
  const dates = await vi.importActual<typeof import("@/modules/care/services/nextDueDate")>(
    "@/modules/care/services/nextDueDate",
  )
  return {
    getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
    markTaskInstanceDone: vi.fn(),
    assignTaskInstance: (...a: unknown[]) => assignTaskInstance(...a),
    setTaskReminder: vi.fn(),
    canAssignTasks: (n: number) => n > 1,
    computeNextDueDate: dates.computeNextDueDate,
  }
})
vi.mock("@/modules/home", () => ({ getHomeMembers: (...a: unknown[]) => getHomeMembers(...a) }))
vi.mock("@/modules/knowledge", () => ({ getManualsByItem: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/hooks/useManualManagement", () => ({ resolveManualUrl: vi.fn() }))
vi.mock("@/components/care/TaskFeedbackSheet", () => ({ TaskFeedbackSheet: () => null }))
vi.mock("@/components/care/ManualDockPanel", () => ({ ManualDockPanel: () => null }))
vi.mock("@/components/tasks/TaskEditSheet", () => ({ TaskEditSheet: () => null }))
vi.mock("@/components/tasks/HowToSteps", () => ({ HowToSteps: () => null }))
vi.mock("@/components/item-care/SupplyRows", () => ({ SupplyRows: () => null }))
vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

import { RefinedTaskDetail } from "./RefinedTaskDetail"

const DETAIL = {
  taskInstanceId: "ti-1",
  taskTemplateId: "tt-1",
  title: "Replace the furnace filter",
  tier: "essential",
  careType: "maintenance",
  justification: null,
  estimatedMinutes: 10,
  dueDate: "2026-09-29",
  assignedTo: null,
  notes: null,
  steps: null,
  supplies: [],
  scheduleType: "monthly",
  intervalDays: null,
  neverCompleted: false,
  manualPage: null,
  itemUnitId: null,
  itemName: null,
  roomName: null,
  schedule: { scheduleType: "monthly", intervalDays: null, season: null },
  remindEnabled: null,
}

const MEMBERS = [
  { user_id: "u-barb", profile: { full_name: "Barb" } },
  { user_id: "u-chris", profile: { full_name: "Chris" } },
]

beforeEach(() => {
  vi.clearAllMocks()
  getTaskDetail.mockResolvedValue({ data: DETAIL, error: null })
  getHomeMembers.mockResolvedValue({ data: MEMBERS, error: null })
})

const renderPage = () => render(<RefinedTaskDetail taskInstanceId="ti-1" homeId="home-1" onBack={vi.fn()} />)

describe("task page — a failed read is not 'Task not found'", () => {
  it("says it couldn't load, offers a retry, and the retry loads the task", async () => {
    getTaskDetail.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    renderPage()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Couldn't load this task")
    expect(screen.queryByText("Task not found.")).toBeNull()

    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }))
    expect((await screen.findAllByText("Replace the furnace filter")).length).toBeGreaterThan(0)
    expect(getTaskDetail).toHaveBeenCalledTimes(2)
  })

  it("a task that is genuinely gone still says so", async () => {
    getTaskDetail.mockResolvedValueOnce({ data: null, error: null })
    renderPage()
    expect(await screen.findByText("Task not found.")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("task page — a refused assignment is rolled back and said", () => {
  it("puts the previous assignee back and says the change didn't save", async () => {
    assignTaskInstance.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderPage()
    await screen.findAllByText("Replace the furnace filter")

    // Both lanes (phone body, desktop rail) carry the control; either works.
    fireEvent.click(screen.getAllByRole("button", { name: /Assigned to/ })[0])
    fireEvent.click(screen.getAllByRole("button", { name: /Chris/ })[0])

    await waitFor(() => expect(assignTaskInstance).toHaveBeenCalledWith("home-1", "ti-1", "u-chris"))
    const alerts = await screen.findAllByRole("alert")
    for (const a of alerts) expect(a).toHaveTextContent("Couldn't change who this is assigned to.")
    // Rolled back: the control reads "Anyone" again, never the unsaved name.
    for (const b of screen.getAllByRole("button", { name: /Assigned to/ })) {
      expect(b).toHaveTextContent("Anyone")
      expect(b).not.toHaveTextContent("Chris")
    }
  })

  it("a LATE failure of an older assignment can't roll back a newer one that landed", async () => {
    let failFirst: (v: unknown) => void = () => {}
    assignTaskInstance
      .mockImplementationOnce(() => new Promise((resolve) => { failFirst = resolve })) // Chris: slow, then refused
      .mockResolvedValueOnce({ data: {}, error: null }) // Barb: lands at once
    renderPage()
    await screen.findAllByText("Replace the furnace filter")

    fireEvent.click(screen.getAllByRole("button", { name: /Assigned to/ })[0])
    fireEvent.click(screen.getAllByRole("button", { name: /Chris/ })[0])
    fireEvent.click(screen.getAllByRole("button", { name: /Assigned to/ })[0])
    fireEvent.click(screen.getAllByRole("button", { name: /Barb/ })[0])
    await waitFor(() => expect(assignTaskInstance).toHaveBeenCalledTimes(2))

    // The older one's refusal arrives last.
    await act(async () => failFirst({ data: null, error: { message: "permission-denied" } }))

    for (const b of screen.getAllByRole("button", { name: /Assigned to/ })) expect(b).toHaveTextContent("Barb")
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
