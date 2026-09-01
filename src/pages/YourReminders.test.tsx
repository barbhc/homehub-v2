/**
 * /reminders — describe → propose → edit → turn on.
 *
 * Two invariants the owner set at plan review are pinned here: curation NEVER
 * deletes (no delete API is ever called, an unticked row is simply not
 * written), and a failed write stays VISIBLE on the list with a retry rather
 * than vanishing into a success screen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import YourReminders from "./YourReminders"

const proposeReminders = vi.fn()
const getTaskTemplates = vi.fn()
const setTaskReminder = vi.fn()
const setTaskCadence = vi.fn()
const deleteTaskTemplate = vi.fn()
const archiveTaskTemplate = vi.fn()
const getNotificationPrefs = vi.fn()
const setNotificationPrefs = vi.fn()

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "h1" } }) }))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
vi.mock("@/modules/care", () => ({
  proposeReminders: (...a: unknown[]) => proposeReminders(...a),
  getTaskTemplates: (...a: unknown[]) => getTaskTemplates(...a),
  setTaskReminder: (...a: unknown[]) => setTaskReminder(...a),
  setTaskCadence: (...a: unknown[]) => setTaskCadence(...a),
  deleteTaskTemplate: (...a: unknown[]) => deleteTaskTemplate(...a),
  archiveTaskTemplate: (...a: unknown[]) => archiveTaskTemplate(...a),
}))
vi.mock("@/lib/userPreferences", () => ({
  getNotificationPrefs: (...a: unknown[]) => getNotificationPrefs(...a),
  setNotificationPrefs: (...a: unknown[]) => setNotificationPrefs(...a),
}))
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a>,
}))

const proposal = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  task_template_id: id, title, item_name: "Furnace", reason: "You mentioned filters.",
  current_schedule_type: "quarterly", current_interval_days: null,
  suggested_schedule_type: null, suggested_interval_days: null, remind_already_on: false, priority_tier: "recommended", ...over,
})
const template = (id: string, title: string) => ({ task_template_id: id, title, schedule: { scheduleType: "monthly" } })

beforeEach(() => {
  vi.clearAllMocks()
  getTaskTemplates.mockResolvedValue({ data: [template("t1", "Replace the furnace filter"), template("t9", "Flush the water heater")], error: null })
  setTaskReminder.mockResolvedValue({ data: true, error: null })
  setTaskCadence.mockResolvedValue({ data: true, error: null })
  getNotificationPrefs.mockResolvedValue({ push_mode: "curated+essential", events: {}, weekly_digest: { enabled: true, day: 0, hour: 17 }, quiet_hours: null, lead_time_days: 0 })
  setNotificationPrefs.mockResolvedValue(undefined)
})

async function describeAndPropose(proposals: unknown[]) {
  proposeReminders.mockResolvedValue({ ok: true, total_templates: 2, proposals })
  render(<YourReminders />)
  fireEvent.change(screen.getByLabelText("What do you want to stay on top of?"), { target: { value: "filters and the smoke alarms" } })
  fireEvent.click(screen.getByRole("button", { name: "Propose my reminders" }))
  await waitFor(() => expect(screen.getByText(/proposed · from what you told us/)).toBeInTheDocument())
}

describe("YourReminders", () => {
  it("turns on only the ticked rows, writes cadence only when it changed, and never deletes anything", async () => {
    await describeAndPropose([
      proposal("t1", "Replace the furnace filter", { suggested_schedule_type: "monthly" }),
      proposal("t2", "Test smoke alarms"),
    ])
    fireEvent.click(screen.getByLabelText("Test smoke alarms")) // untick
    fireEvent.click(screen.getByRole("button", { name: /Turn these on · 1/ }))
    await waitFor(() => expect(screen.getByText("1 reminder on.")).toBeInTheDocument())

    expect(setTaskReminder).toHaveBeenCalledTimes(1)
    expect(setTaskReminder).toHaveBeenCalledWith("h1", "t1", true)
    expect(setTaskCadence).toHaveBeenCalledWith("h1", "t1", "monthly", null)
    // the unticked row is simply not written — and NOTHING is ever deleted
    expect(setTaskReminder).not.toHaveBeenCalledWith("h1", "t2", expect.anything())
    expect(deleteTaskTemplate).not.toHaveBeenCalled()
    expect(archiveTaskTemplate).not.toHaveBeenCalled()
  })

  it("a proposal that keeps its schedule does not write a cadence", async () => {
    await describeAndPropose([proposal("t1", "Replace the furnace filter")])
    fireEvent.click(screen.getByRole("button", { name: /Turn these on · 1/ }))
    await waitFor(() => expect(screen.getByText("1 reminder on.")).toBeInTheDocument())
    expect(setTaskCadence).not.toHaveBeenCalled()
  })

  it("the callable failing is VISIBLE, and nothing is written", async () => {
    proposeReminders.mockRejectedValue(new Error("model unavailable"))
    render(<YourReminders />)
    fireEvent.change(screen.getByLabelText("What do you want to stay on top of?"), { target: { value: "filters" } })
    fireEvent.click(screen.getByRole("button", { name: "Propose my reminders" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Couldn't propose reminders")
    expect(alert).toHaveTextContent("model unavailable")
    expect(setTaskReminder).not.toHaveBeenCalled()
  })

  it("a failed write keeps the row on screen with its error and a retry — no false success", async () => {
    await describeAndPropose([proposal("t1", "Replace the furnace filter"), proposal("t2", "Test smoke alarms")])
    setTaskReminder.mockImplementation(async (_h: string, id: string) =>
      id === "t2" ? { data: null, error: { message: "permission denied" } } : { data: true, error: null })
    fireEvent.click(screen.getByRole("button", { name: /Turn these on · 2/ }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("permission denied")
    expect(screen.queryByText(/reminders? on\./)).not.toBeInTheDocument()
    expect(screen.getByLabelText("Test smoke alarms")).toBeInTheDocument()

    setTaskReminder.mockResolvedValue({ data: true, error: null })
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.getByText("2 reminders on.")).toBeInTheDocument())
  })

  it("search adds a task the model missed — the AI-free path", async () => {
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    fireEvent.change(await screen.findByLabelText("Search your tasks"), { target: { value: "water" } })
    fireEvent.click(await screen.findByRole("button", { name: "Add Flush the water heater" }))
    expect(screen.getByLabelText("Flush the water heater")).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: /Turn these on · 1/ }))
    await waitFor(() => expect(setTaskReminder).toHaveBeenCalledWith("h1", "t9", true))
  })

  it("at the end it OFFERS 'Just my list' — and writes the mode only on yes", async () => {
    await describeAndPropose([proposal("t1", "Replace the furnace filter")])
    fireEvent.click(screen.getByRole("button", { name: /Turn these on · 1/ }))
    await screen.findByText("From now on, notify only this list?")
    expect(setNotificationPrefs).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Just my list" }))
    await waitFor(() => expect(setNotificationPrefs).toHaveBeenCalledWith("u1", expect.objectContaining({ push_mode: "curated" })))
  })
})
