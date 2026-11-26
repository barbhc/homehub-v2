/**
 * A snoozed task's own page (seventeen fixes, mock m1; owner-approved
 * 2026-11-25, button named "Unsnooze").
 *
 * Snooze a task on Home and it left Home until Dec 9 — and its page still read
 * "Essential · Good to do now", with reminders on and no way to undo. These pin
 * the mock's must-be-true lines, each quoted:
 *   1. "While a task is snoozed, its page reads 'Snoozed until {date}'. 'Good to
 *      do now' is not rendered."
 *   2. "The reminder row reads 'Paused until {date}'."
 *   3. "Unsnooze returns the task to Home and Tasks with its original due date.
 *      If the write fails, the page says so and stays snoozed."
 *   4. "Mark done still works on a snoozed task."
 *   5. "Once the snooze date passes, the page reads as it does today and
 *      Unsnooze is gone."
 *   6. "Mark done is the one filled button. Unsnooze is outlined and the same size."
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { addDays, localToday } from "../../../shared/dates/calendar"

const getTaskDetail = vi.fn()
const unsnoozeTaskInstance = vi.fn()
const markTaskInstanceDone = vi.fn()

vi.mock("@/modules/care", async () => {
  const dates = await vi.importActual<typeof import("@/modules/care/services/nextDueDate")>(
    "@/modules/care/services/nextDueDate",
  )
  return {
    getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
    markTaskInstanceDone: (...a: unknown[]) => markTaskInstanceDone(...a),
    unsnoozeTaskInstance: (...a: unknown[]) => unsnoozeTaskInstance(...a),
    assignTaskInstance: vi.fn(),
    setTaskReminder: vi.fn(),
    canAssignTasks: () => false,
    computeNextDueDate: dates.computeNextDueDate,
  }
})
// The task page names the signed-in person ("You") when a member has no name.
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "uid-me", email: "me@example.com", user_metadata: {} }, loading: false }) }))
vi.mock("@/modules/home", () => ({ getHomeMembers: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/hooks/usePushMode", () => ({ usePushMode: () => ({ mode: "curated" }) }))
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

const today = localToday()
const UNTIL = addDays(today, 14)
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })

/** An Essential monthly filter change, due today, snoozed for 14 days. */
const SNOOZED = {
  taskInstanceId: "ti-1",
  taskTemplateId: "tt-1",
  title: "Replace HVAC furnace filter",
  tier: "essential",
  careType: "maintenance",
  justification: null,
  description: null,
  estimatedMinutes: 10,
  dueDate: today,
  status: "snoozed",
  snoozedUntil: UNTIL,
  assignedTo: null,
  notes: null,
  steps: null,
  supplies: [],
  scheduleType: "monthly",
  intervalDays: null,
  neverCompleted: false,
  manualPage: null,
  itemUnitId: null,
  itemName: "Carrier Infinity Furnace",
  roomName: "Garage",
  schedule: { scheduleType: "monthly", intervalDays: null, season: null },
  remindEnabled: null,
}

const renderPage = () => render(<RefinedTaskDetail taskInstanceId="ti-1" homeId="home-1" onBack={() => {}} />)

beforeEach(() => {
  getTaskDetail.mockReset()
  unsnoozeTaskInstance.mockReset()
  markTaskInstanceDone.mockReset()
})

describe("a snoozed task's page", () => {
  it("1: the status line reads 'Snoozed until {date}' and 'Good to do now' is not rendered", async () => {
    getTaskDetail.mockResolvedValue({ data: SNOOZED, error: null })
    renderPage()
    expect(await screen.findByText(`Snoozed until ${fmt(UNTIL)}`)).toBeInTheDocument()
    expect(screen.queryByText(/Good to do now/)).toBeNull()
    // The tier still leads the line.
    expect(screen.getAllByText("Essential").length).toBeGreaterThan(0)
  })

  it("2: the reminder row reads 'Paused until {date}' in both lanes", async () => {
    // A reminder that is on (here, turned on by her): the snooze holds it.
    getTaskDetail.mockResolvedValue({ data: { ...SNOOZED, remindEnabled: true }, error: null })
    renderPage()
    const lines = await screen.findAllByTestId("reminder-line")
    // Phone lane and desktop rail: the same words in each.
    expect(lines.length).toBe(2)
    for (const l of lines) expect(l).toHaveTextContent(`Paused until ${fmt(UNTIL)}`)
  })

  it("2: a reminder that is off says so, not 'Paused' — there is nothing to pause", async () => {
    getTaskDetail.mockResolvedValue({ data: { ...SNOOZED, remindEnabled: false }, error: null })
    renderPage()
    const lines = await screen.findAllByTestId("reminder-line")
    for (const l of lines) expect(l).toHaveTextContent("You turned this off")
  })

  it("6: Mark done is the filled button and Unsnooze sits beside it, outlined, in both lanes", async () => {
    getTaskDetail.mockResolvedValue({ data: SNOOZED, error: null })
    renderPage()
    const unsnoozes = await screen.findAllByRole("button", { name: "Unsnooze" })
    expect(unsnoozes).toHaveLength(2) // desktop rail + phone bar
    for (const u of unsnoozes) {
      const pair = u.parentElement!
      // Equal columns: a two-column grid holding exactly Mark done and Unsnooze.
      expect(pair.className).toContain("grid-cols-2")
      const markDone = within(pair).getByRole("button", { name: /Mark done/ })
      expect(markDone.style.background).toContain("--hh-teal-fill")
      expect(u.className).toContain("border")
      expect(u.style.background).toContain("--hh-surface")
    }
    const bar = screen.getByTestId("task-action-bar")
    expect(within(bar).getByRole("button", { name: "Unsnooze" })).toBeInTheDocument()
  })

  it("3: Unsnooze makes the Undo write and the page reads as an open task again", async () => {
    getTaskDetail.mockResolvedValue({ data: SNOOZED, error: null })
    unsnoozeTaskInstance.mockResolvedValue({ success: true, data: {} })
    renderPage()
    const [u] = await screen.findAllByRole("button", { name: "Unsnooze" })
    fireEvent.click(u)
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Unsnooze" })).toHaveLength(0))
    // No prior: the occurrence goes back to scheduled, its due date untouched.
    expect(unsnoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1")
    expect(screen.queryByText(/Snoozed until/)).toBeNull()
    expect(screen.queryByText(/Paused until/)).toBeNull()
  })

  it("3: a refused Unsnooze says so and the page stays snoozed", async () => {
    getTaskDetail.mockResolvedValue({ data: SNOOZED, error: null })
    unsnoozeTaskInstance.mockResolvedValue({ success: false, error: "network" })
    renderPage()
    const [u] = await screen.findAllByRole("button", { name: "Unsnooze" })
    fireEvent.click(u)
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("Couldn't unsnooze this task.")
    expect(screen.getByText(`Snoozed until ${fmt(UNTIL)}`)).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Unsnooze" })).toHaveLength(2)
  })

  it("4: Mark done still opens its sheet on a snoozed task", async () => {
    getTaskDetail.mockResolvedValue({ data: SNOOZED, error: null })
    renderPage()
    const bar = await screen.findByTestId("task-action-bar")
    fireEvent.click(within(bar).getByRole("button", { name: /Mark done/ }))
    markTaskInstanceDone.mockResolvedValue({ success: true })
    fireEvent.click(await screen.findByRole("button", { name: /^confirm$/i }))
    await waitFor(() => expect(markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, expect.anything()))
    expect(await screen.findAllByText(/^Done/)).not.toHaveLength(0)
  })

  it("5: once the snooze date has passed, the page reads as an open task and Unsnooze is gone", async () => {
    getTaskDetail.mockResolvedValue({ data: { ...SNOOZED, dueDate: addDays(today, -20), snoozedUntil: today }, error: null })
    renderPage()
    await screen.findAllByRole("button", { name: /Mark done/ })
    expect(screen.queryByText(/Snoozed until/)).toBeNull()
    expect(screen.queryByText(/Paused until/)).toBeNull()
    expect(screen.queryAllByRole("button", { name: "Unsnooze" })).toHaveLength(0)
  })

  it("a task that was never snoozed has no Unsnooze", async () => {
    getTaskDetail.mockResolvedValue({ data: { ...SNOOZED, status: "scheduled", snoozedUntil: null }, error: null })
    renderPage()
    await screen.findAllByRole("button", { name: /Mark done/ })
    expect(screen.queryAllByRole("button", { name: "Unsnooze" })).toHaveLength(0)
    expect(screen.queryByText(/Snoozed until/)).toBeNull()
  })
})
