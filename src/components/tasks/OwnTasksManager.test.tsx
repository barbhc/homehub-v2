/**
 * Your own tasks (Tasks → Add your own task, /maintenance/custom).
 *
 * One form replaces two (design/settings-your-home.md): Settings' "Custom
 * tasks" silently created CLEANING tasks, and Your home's "Add something the
 * library missed" created upkeep tasks. "Shows in" now says which, and each
 * choice calls the service the old form called.
 *
 * The failure cases moved here with the list from Settings.failures.test.tsx;
 * the "her own task" cases were ported from Your home's tests (49b6ebf).
 * Each forces the failure and asserts the person SEES it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const m = vi.hoisted(() => ({
  getRoutineTemplates: vi.fn(),
  saveRoutineTask: vi.fn(),
  deleteRoutineTask: vi.fn(),
  addCustomHomeTask: vi.fn(),
}))

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }) }))
vi.mock("@/lib/cleanSession", () => ({
  getRoutineTemplates: (...a: unknown[]) => m.getRoutineTemplates(...a),
  saveRoutineTask: (...a: unknown[]) => m.saveRoutineTask(...a),
  deleteRoutineTask: (...a: unknown[]) => m.deleteRoutineTask(...a),
}))
vi.mock("@/modules/care", () => ({ addCustomHomeTask: (...a: unknown[]) => m.addCustomHomeTask(...a) }))

const { default: OwnTasksPage } = await import("@/pages/OwnTasksPage")

const routine = (id: string, title: string, schedule_type = "weekly") => ({ task_template_id: id, title, schedule_type, estimated_minutes: null })

beforeEach(() => {
  vi.clearAllMocks()
  m.getRoutineTemplates.mockResolvedValue([])
  m.saveRoutineTask.mockResolvedValue({ task_template_id: "new-cleaning" })
  m.addCustomHomeTask.mockResolvedValue({ data: { task_template_id: "new-upkeep", title: "Have the chimney swept" }, error: null })
  m.deleteRoutineTask.mockResolvedValue({ ok: true })
})

const renderPage = () => render(<MemoryRouter><OwnTasksPage /></MemoryRouter>)
const type = (title: string) => fireEvent.change(screen.getByLabelText("Task name"), { target: { value: title } })
const add = () => fireEvent.click(screen.getByRole("button", { name: "Add task" }))
const showsIn = (name: string) => screen.getByRole("radio", { name })

describe("Your own tasks — the page", () => {
  it("is headed “Your own tasks” once, with a link back to Tasks", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { level: 1, name: "Your own tasks" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading")).toHaveLength(1)
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/maintenance")
  })

  it("asks where the task shows, starting on Upkeep", async () => {
    renderPage()
    const group = await screen.findByRole("radiogroup", { name: "Shows in" })
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Upkeep", "Cleaning"])
    expect(showsIn("Upkeep")).toHaveAttribute("aria-checked", "true")
    expect(showsIn("Cleaning")).toHaveAttribute("aria-checked", "false")
  })

  it("offers cadences in words, never the stored names", async () => {
    renderPage()
    const options = within(await screen.findByLabelText("How often")).getAllByRole("option").map((o) => o.textContent)
    expect(options).toEqual(["Weekly", "Monthly", "Quarterly", "Twice a year", "Yearly", "When needed"])
  })

  it("Add is off until the task has a name", async () => {
    renderPage()
    expect(await screen.findByRole("button", { name: "Add task" })).toBeDisabled()
    type("   ")
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled()
    type("Sweep the deck")
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled()
  })
})

describe("Your own tasks — Shows in decides which kind of task is created", () => {
  it("Upkeep (the default): her own words become a plain home task on the cadence she picked", async () => {
    renderPage()
    await screen.findByLabelText("Task name")
    type("Have the chimney swept")
    fireEvent.change(screen.getByLabelText("How often"), { target: { value: "annual" } })
    add()

    await waitFor(() => expect(m.addCustomHomeTask).toHaveBeenCalledWith("home-1", "Have the chimney swept", "annual", null, null))
    expect(m.saveRoutineTask).not.toHaveBeenCalled()
    expect(await screen.findByRole("status")).toHaveTextContent("Added Have the chimney swept to your Tasks.")
  })

  it("Upkeep carries the minutes she gave", async () => {
    renderPage()
    await screen.findByLabelText("Task name")
    type("Oil the gate hinges")
    fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "20" } })
    add()
    await waitFor(() => expect(m.addCustomHomeTask).toHaveBeenCalledWith("home-1", "Oil the gate hinges", "weekly", null, 20))
  })

  it("Cleaning: the task is saved as a cleaning routine, exactly as Settings' form did", async () => {
    renderPage()
    await screen.findByLabelText("Task name")
    type("  Mop the hall  ")
    fireEvent.change(screen.getByLabelText("How often"), { target: { value: "monthly" } })
    fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "15" } })
    fireEvent.click(showsIn("Cleaning"))
    expect(showsIn("Cleaning")).toHaveAttribute("aria-checked", "true")
    add()

    await waitFor(() => expect(m.saveRoutineTask).toHaveBeenCalledWith("home-1", "Mop the hall", "monthly", 15))
    expect(m.addCustomHomeTask).not.toHaveBeenCalled()
    expect(await screen.findByRole("status")).toHaveTextContent("Added Mop the hall to your Tasks.")
  })

  it("after an add the form is ready for the next one, and the new task is in the list", async () => {
    m.getRoutineTemplates.mockResolvedValueOnce([]).mockResolvedValueOnce([routine("new-upkeep", "Have the chimney swept", "annual")])
    renderPage()
    await screen.findByLabelText("Task name")
    type("Have the chimney swept")
    add()

    const list = within(await screen.findByTestId("own-tasks-list"))
    expect(await list.findByText("Have the chimney swept")).toBeInTheDocument()
    expect(list.getByText("Yearly")).toBeInTheDocument()
    expect(screen.getByLabelText("Task name")).toHaveValue("")
  })
})

describe("Your own tasks — the “Added” line stays on screen", () => {
  // Ported from Your home: every Add used to reload with the spinner in place
  // of the page, so the line it had just said was drawn for a single frame.
  // The re-read after an add happens behind the page.
  it("through the re-read that follows the Add — the form never gives way to the spinner", async () => {
    renderPage()
    await screen.findByLabelText("Task name")
    type("Have the chimney swept")
    let answerRefresh!: (v: unknown) => void
    m.getRoutineTemplates.mockReturnValueOnce(new Promise((r) => { answerRefresh = r }))
    add()

    // The task is added and the list is being read again — behind the page.
    await waitFor(() => expect(m.getRoutineTemplates).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("status")).toHaveTextContent("Added Have the chimney swept to your Tasks.")
    expect(screen.queryByText("Loading…")).toBeNull()

    await act(async () => { answerRefresh([routine("t1", "Have the chimney swept", "annual")]) })
    expect(screen.getByRole("status")).toHaveTextContent("Added Have the chimney swept to your Tasks.")
    expect(screen.getByLabelText("Task name")).toHaveValue("")
    expect(screen.queryByText("Loading…")).toBeNull()
  })
})

describe("Your own tasks — failures are said", () => {
  it("an Upkeep add that fails keeps the typed task in the form and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    m.addCustomHomeTask.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderPage()
    await screen.findByLabelText("Task name")
    type("Have the chimney swept")
    add()

    expect(await screen.findByText("Couldn't add that task. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByLabelText("Task name")).toHaveValue("Have the chimney swept")
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not add a task (upkeep, home home-1)"), "permission-denied")
    // Nothing was added, so the list is not read again.
    expect(m.getRoutineTemplates).toHaveBeenCalledTimes(1)
  })

  it("a Cleaning add that fails keeps the typed task in the form and says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.saveRoutineTask.mockResolvedValue({ error: "unavailable" })
    renderPage()
    await screen.findByLabelText("Task name")
    type("Mop the hall")
    fireEvent.click(showsIn("Cleaning"))
    add()

    expect(await screen.findByText("Couldn't add that task. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByLabelText("Task name")).toHaveValue("Mop the hall")
    expect(showsIn("Cleaning")).toHaveAttribute("aria-checked", "true")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("a delete the server refuses keeps the task and says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getRoutineTemplates.mockResolvedValue([routine("rt1", "Water the ferns")])
    m.deleteRoutineTask.mockResolvedValue({ ok: false, error: "permission-denied" })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Delete Water the ferns" }))

    expect(await screen.findByText("Couldn't delete that task. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByText("Water the ferns")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete Water the ferns" })).toBeEnabled()
  })

  it("a delete that works removes the task (the control case)", async () => {
    m.getRoutineTemplates.mockResolvedValue([routine("rt1", "Water the ferns")])
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Delete Water the ferns" }))
    await waitFor(() => expect(screen.queryByText("Water the ferns")).toBeNull())
    expect(m.deleteRoutineTask).toHaveBeenCalledWith("home-1", "rt1")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("tasks that could not be read say so instead of an empty list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getRoutineTemplates.mockRejectedValue(new Error("Failed to load routine templates: unavailable"))
    renderPage()
    expect(await screen.findByText("Couldn't load your own tasks.")).toBeInTheDocument()
  })

  // H5 moved the read into one reader + one apply (readRoutines/applyRoutines).
  // Try again is the imperative path through them.
  it("Try again reads them again and lists them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getRoutineTemplates
      .mockRejectedValueOnce(new Error("Failed to load routine templates: unavailable"))
      .mockResolvedValueOnce([routine("rt1", "Water the ferns")])
    renderPage()
    const failed = (await screen.findByText("Couldn't load your own tasks.")).closest("[role=alert]") as HTMLElement
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Water the ferns")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your own tasks.")).toBeNull()
  })

  it("with no tasks of her own there is no empty list, only the form", async () => {
    renderPage()
    await screen.findByLabelText("Task name")
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())
    expect(screen.queryAllByTestId("own-tasks-list")).toHaveLength(0)
  })
})
