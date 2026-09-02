/**
 * /reminders — describe → propose → edit → turn on.
 *
 * Two invariants the owner set at plan review are pinned here: curation NEVER
 * deletes (no delete API is ever called, an unticked row is simply not
 * written), and a failed write stays VISIBLE on the list with a retry rather
 * than vanishing into a success screen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react"
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
const getItemUnits = vi.fn()
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => getItemUnits(...a) }))
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
const template = (id: string, title: string, item_unit_id: string | null = null, over: Record<string, unknown> = {}) =>
  ({ task_template_id: id, title, item_unit_id, care_type: "maintenance", scope_type: item_unit_id ? "item_unit" : "home",
     schedule: { scheduleType: "monthly", intervalDays: null }, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  getTaskTemplates.mockResolvedValue({ data: [template("t1", "Replace the furnace filter"), template("t9", "Flush the water heater")], error: null })
  getItemUnits.mockResolvedValue({ data: [], error: null })
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

/**
 * Owner, 2026-09-01, on the live pick list: "there's no context on which
 * items these are for." A task title alone ("Replace the filter") is a
 * riddle; the item is the context. And the Skip path used to land on an
 * empty search box — nothing to pick from until you guessed a word.
 */
describe("pick from your tasks — the item is the context", () => {
  const withItems = () => {
    getTaskTemplates.mockResolvedValue({
      data: [
        template("t1", "Replace the filter", "i-furnace"),
        template("t2", "Flush the tank", "i-heater"),
        template("t3", "Test smoke alarms", null),
      ],
      error: null,
    })
    getItemUnits.mockResolvedValue({
      data: [
        { item_unit_id: "i-furnace", display_name: "Carrier Furnace" },
        { item_unit_id: "i-heater", display_name: "Rheem Water Heater" },
      ],
      error: null,
    })
  }

  it("lists every task under its item WITHOUT searching, whole-home last", async () => {
    withItems()
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    const list = await screen.findByTestId("pick-list")
    const groups = Array.from(list.querySelectorAll("section")).map((g) => g.getAttribute("aria-label"))
    expect(groups).toEqual(["Carrier Furnace", "Rheem Water Heater", "Whole home"])
    expect(screen.getByRole("button", { name: "Add Replace the filter" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Test smoke alarms" })).toBeInTheDocument()
  })

  it("search finds a task by its ITEM's name, and the hit says which item", async () => {
    withItems()
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    await screen.findByTestId("pick-list")
    fireEvent.change(screen.getByLabelText("Search your tasks"), { target: { value: "rheem" } })
    expect(screen.getByRole("button", { name: "Add Flush the tank" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add Replace the filter" })).not.toBeInTheDocument()
    expect(screen.getByText("Rheem Water Heater")).toBeInTheDocument()
  })

  it("a picked task carries its item onto the list", async () => {
    withItems()
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    await screen.findByTestId("pick-list")
    fireEvent.click(screen.getByRole("button", { name: "Add Replace the filter" }))
    const row = screen.getByLabelText("Replace the filter").closest("label")!
    expect(row.textContent).toContain("Carrier Furnace")
    // …and it has left the pick list.
    expect(screen.queryByRole("button", { name: "Add Replace the filter" })).not.toBeInTheDocument()
  })

  it("item names failing to load never hides the tasks", async () => {
    withItems()
    getItemUnits.mockResolvedValue({ data: null, error: new Error("offline") })
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    const list = await screen.findByTestId("pick-list")
    expect(Array.from(list.querySelectorAll("section")).map((g) => g.getAttribute("aria-label"))).toEqual(["Whole home"])
    expect(screen.getByRole("button", { name: "Add Replace the filter" })).toBeInTheDocument()
  })
})

/**
 * The corpus is not the menu. On the owner's real home the first cut of the
 * pick list offered every parsed template — "Allow Motor to Cool After
 * Overload" beside the furnace filter — and buried the dozen tasks a reminder
 * is for. Nothing is deleted; tips stay on the item page. They are just not
 * reminders, and neither is anything the push lanes would never send.
 */
describe("pick from your tasks — only what recurs and would notify", () => {
  const corpus = () => {
    getTaskTemplates.mockResolvedValue({
      data: [
        template("t1", "Replace the filter", "i-furnace", { schedule: { scheduleType: "quarterly", intervalDays: null } }),
        template("t2", "Allow motor to cool after overload", "i-blender", { schedule: { scheduleType: "as_needed", intervalDays: null } }),
        template("t3", "Verify clearance around unit", "i-blender", { schedule: { scheduleType: "setup", intervalDays: null } }),
        template("t4", "Rinse after each use", "i-blender", { schedule: { scheduleType: "after_each_use", intervalDays: null } }),
        template("t5", "No schedule at all", "i-blender", { schedule: null }),
        // Item-scoped CLEANING recurs, but the week + push lanes never carry it
        // (owner's rule: Home is for maintenance) — offering it would be a lie.
        template("t6", "Wipe the control panel", "i-blender", { care_type: "cleaning", schedule: { scheduleType: "monthly", intervalDays: null } }),
        // Home-scoped cleaning IS a household chore and does notify.
        template("t7", "Wipe down kitchen surfaces", null, { care_type: "cleaning", schedule: { scheduleType: "weekly", intervalDays: null } }),
      ],
      error: null,
    })
    getItemUnits.mockResolvedValue({
      data: [{ item_unit_id: "i-furnace", display_name: "Carrier Furnace" }, { item_unit_id: "i-blender", display_name: "Beast Blender" }],
      error: null,
    })
  }

  it("offers the recurring, notifiable tasks and nothing else", async () => {
    corpus()
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    const list = await screen.findByTestId("pick-list")
    const offered = Array.from(list.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(offered).toEqual(["Add Replace the filter", "Add Wipe down kitchen surfaces"])
    // The blender has nothing offerable, so it gets no group at all.
    expect(Array.from(list.querySelectorAll("section")).map((g) => g.getAttribute("aria-label"))).toEqual(["Carrier Furnace", "Whole home"])
  })

  it("search obeys the same rule — a tip cannot be found by name either", async () => {
    corpus()
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    await screen.findByTestId("pick-list")
    fireEvent.change(screen.getByLabelText("Search your tasks"), { target: { value: "blender" } })
    expect(screen.queryByRole("button", { name: /^Add / })).not.toBeInTheDocument()
    expect(screen.getByText(/No tasks match/)).toBeInTheDocument()
  })

  it("a picked task shows its real cadence, not 'schedule not set'", async () => {
    corpus()
    render(<YourReminders />)
    fireEvent.click(screen.getByRole("button", { name: "Skip — pick from your tasks" }))
    await screen.findByTestId("pick-list")
    fireEvent.click(screen.getByRole("button", { name: "Add Replace the filter" }))
    const row = screen.getByLabelText("Replace the filter").closest("label")!
    expect(row.textContent).toMatch(/quarter/i)
    expect(row.textContent).not.toContain("schedule not set")
  })
})

/**
 * Seen live 2026-09-02: the proposal offered "Descale the Machine · Nespresso
 * Coffee · when needed". A reminder on a task with no recurring schedule never
 * produces a due occurrence, so it never notifies — turning it on was a silent
 * no-op dressed as success. The pick list already refused such tasks
 * (`offerable`); the proposal path is now held to the same standard on the
 * server, and THIS is the client's own guard, because hosting and functions
 * deploy separately and a page can outrun the callable behind it.
 */
describe("a proposed row with no cadence", () => {
  const nespresso = (over: Record<string, unknown> = {}) =>
    proposal("t8", "Descale the machine", { item_name: "Nespresso Coffee", current_schedule_type: "as_needed", ...over })

  it("cannot be turned on: the reason is on the row, the picker is open, and the button stays shut", async () => {
    await describeAndPropose([proposal("t1", "Replace the furnace filter"), nespresso()])
    expect(screen.getByText("Needs a schedule to remind you — pick how often.")).toBeInTheDocument()
    // The picker is already open, on "Choose…" — no cadence was picked FOR the owner.
    const select = screen.getByLabelText("How often for Descale the machine")
    expect(select).toHaveValue("")
    // "When needed" is not a reminder cadence; it is not on offer.
    expect(within(select).queryByRole("option", { name: "When needed" })).toBeNull()
    expect(within(select).getByRole("option", { name: "Monthly" })).toBeInTheDocument()
    // The recurring row's picker stays closed until asked.
    expect(screen.queryByLabelText("How often for Replace the furnace filter")).not.toBeInTheDocument()

    const button = screen.getByRole("button", { name: /Turn these on · 2/ })
    expect(button).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent("“Descale the machine” needs a schedule first — pick how often, or untick it.")
    fireEvent.click(button)
    expect(setTaskReminder).not.toHaveBeenCalled()
    expect(setTaskCadence).not.toHaveBeenCalled()
  })

  it.each(["after_each_use", "setup", null])("%s is the same: no cadence, no reminder", async (schedule) => {
    await describeAndPropose([nespresso({ current_schedule_type: schedule })])
    expect(screen.getByRole("button", { name: /Turn these on · 1/ })).toBeDisabled()
    expect(screen.getByLabelText("How often for Descale the machine")).toHaveValue("")
    expect(screen.getByRole("status")).toHaveTextContent("needs a schedule first")
  })

  it("with a cadence chosen, the schedule is written BEFORE the reminder, and the row turns on", async () => {
    await describeAndPropose([nespresso()])
    fireEvent.change(screen.getByLabelText("How often for Descale the machine"), { target: { value: "quarterly" } })
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    const button = screen.getByRole("button", { name: /Turn these on · 1/ })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText("1 reminder on.")).toBeInTheDocument())
    expect(setTaskCadence).toHaveBeenCalledWith("h1", "t8", "quarterly", null)
    expect(setTaskReminder).toHaveBeenCalledWith("h1", "t8", true)
    expect(setTaskCadence.mock.invocationCallOrder[0]).toBeLessThan(setTaskReminder.mock.invocationCallOrder[0])
  })

  it("unticking it is the other way out — the rest turn on without it", async () => {
    await describeAndPropose([proposal("t1", "Replace the furnace filter"), nespresso()])
    fireEvent.click(screen.getByLabelText("Descale the machine"))
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Turn these on · 1/ }))
    await waitFor(() => expect(screen.getByText("1 reminder on.")).toBeInTheDocument())
    expect(setTaskReminder).toHaveBeenCalledTimes(1)
    expect(setTaskReminder).toHaveBeenCalledWith("h1", "t1", true)
    expect(setTaskCadence).not.toHaveBeenCalled()
  })

  it("a schedule that fails to save leaves the reminder OFF — never a flag on a task that cannot come due", async () => {
    await describeAndPropose([nespresso()])
    fireEvent.change(screen.getByLabelText("How often for Descale the machine"), { target: { value: "monthly" } })
    setTaskCadence.mockResolvedValue({ data: null, error: { message: "permission denied" } })
    fireEvent.click(screen.getByRole("button", { name: /Turn these on · 1/ }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("The schedule didn't save: permission denied")
    expect(setTaskReminder).not.toHaveBeenCalled()
    expect(screen.queryByText(/reminders? on\./)).not.toBeInTheDocument()

    // Retry: the schedule again, then the flag.
    setTaskCadence.mockResolvedValue({ data: true, error: null })
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.getByText("1 reminder on.")).toBeInTheDocument())
    expect(setTaskCadence).toHaveBeenCalledTimes(2)
    expect(setTaskReminder).toHaveBeenCalledWith("h1", "t8", true)
  })

  it("the picker keeps a seasonal row's own cadence selectable, but never offers seasonal to another", async () => {
    await describeAndPropose([
      proposal("t2", "Service AC before summer", { current_schedule_type: "seasonal" }),
      nespresso(),
    ])
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0])
    const seasonal = screen.getByLabelText("How often for Service AC before summer")
    expect(seasonal).toHaveValue("seasonal")
    expect(within(seasonal).getByRole("option", { name: "Seasonal" })).toBeInTheDocument()
    const machine = screen.getByLabelText("How often for Descale the machine")
    expect(within(machine).queryByRole("option", { name: "Seasonal" })).toBeNull()
  })
})

describe("a proposal the lanes would never send is not listed", () => {
  it("drops item-scoped cleaning the loaded templates know about, and counts what is left", async () => {
    getTaskTemplates.mockResolvedValue({
      data: [
        template("t1", "Replace the furnace filter", "i-furnace"),
        template("t6", "Wipe the control panel", "i-blender", { care_type: "cleaning", schedule: { scheduleType: "monthly", intervalDays: null } }),
      ],
      error: null,
    })
    proposeReminders.mockResolvedValue({ ok: true, total_templates: 2, proposals: [
      proposal("t1", "Replace the furnace filter"),
      proposal("t6", "Wipe the control panel", { item_name: "Beast Blender" }),
    ] })
    render(<YourReminders />)
    // Let the templates land before proposing — the guard reads them.
    await act(async () => {})
    fireEvent.change(screen.getByLabelText("What do you want to stay on top of?"), { target: { value: "the blender and the filter" } })
    fireEvent.click(screen.getByRole("button", { name: "Propose my reminders" }))
    await screen.findByText("1 proposed · from what you told us")
    expect(screen.getByLabelText("Replace the furnace filter")).toBeInTheDocument()
    expect(screen.queryByLabelText("Wipe the control panel")).not.toBeInTheDocument()
  })
})
