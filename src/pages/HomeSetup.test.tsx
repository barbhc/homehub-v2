/**
 * Your home (/home-setup) — the questions write care facts, the facts unlock
 * whole-home care, and every failure is visible where it happened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const getHomeProfile = vi.fn()
const upsertHomeProfile = vi.fn()
const getTaskTemplates = vi.fn()
const addLibraryTask = vi.fn()
const addCustomHomeTask = vi.fn()
const dismissLibrarySuggestion = vi.fn()

vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "h1" } }),
  getHomeProfile: (...a: unknown[]) => getHomeProfile(...a),
  upsertHomeProfile: (...a: unknown[]) => upsertHomeProfile(...a),
}))
vi.mock("@/modules/care", () => ({
  getTaskTemplates: (...a: unknown[]) => getTaskTemplates(...a),
  addLibraryTask: (...a: unknown[]) => addLibraryTask(...a),
  addCustomHomeTask: (...a: unknown[]) => addCustomHomeTask(...a),
  dismissLibrarySuggestion: (...a: unknown[]) => dismissLibrarySuggestion(...a),
}))
vi.mock("@/components/layout", () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const { default: HomeSetup } = await import("./HomeSetup")
const { categoryStatus, CATEGORIES } = await import("./homeSetupCategories")

const renderPage = () => render(<MemoryRouter><HomeSetup /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  getTaskTemplates.mockResolvedValue({ data: [], error: null })
  getHomeProfile.mockResolvedValue({ data: { care_facts: {}, dismissed_care: [] }, error: null })
  upsertHomeProfile.mockResolvedValue({ data: null, error: null })
})

describe("categoryStatus", () => {
  const safety = CATEGORIES.find((c) => c.key === "safety")!
  const pests = CATEGORIES.find((c) => c.key === "pests")!
  it("reads unanswered / partial / answered / handed to the building", () => {
    expect(categoryStatus(safety, {})).toBe("Not answered yet")
    expect(categoryStatus(safety, { has_smoke_alarms: true })).toBe("1 of 2 answered")
    expect(categoryStatus(safety, { has_smoke_alarms: true, has_extinguisher: false })).toBe("Answered")
    expect(categoryStatus(pests, { building_handles_pests: true, termite_risk: true })).toBe("The building handles it")
  })
})

describe("HomeSetup", () => {
  it("answers already on the home show as answered and unlock their care", async () => {
    getHomeProfile.mockResolvedValue({ data: { care_facts: { has_smoke_alarms: true, has_extinguisher: true }, dismissed_care: [] }, error: null })
    renderPage()
    expect(await screen.findByText("Answered")).toBeTruthy()
    expect(screen.getByText("Test smoke and CO alarms")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Add all/ })).toBeTruthy()
  })

  it("a save that fails stays on the questions and says so", async () => {
    upsertHomeProfile.mockResolvedValue({ data: null, error: { message: "You're offline" } })
    renderPage()
    fireEvent.click(await screen.findByText("Safety"))
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0])
    fireEvent.click(screen.getByRole("button", { name: /Save answers/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/offline/i))
    expect(screen.getByRole("button", { name: /Save answers/ })).toBeTruthy()
    expect(upsertHomeProfile).toHaveBeenCalledWith("h1", { care_facts: { has_smoke_alarms: true } })
  })

  it("a saved answer returns to the list and the suggestions follow", async () => {
    renderPage()
    fireEvent.click(await screen.findByText("Roof, gutters & exterior"))
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }))
    fireEvent.click(screen.getByRole("button", { name: /Save answers/ }))
    expect(await screen.findByText("Clean the gutters")).toBeTruthy()
    expect(screen.getByText("Answered")).toBeTruthy()
  })

  it("a failed profile read is an error with a retry — never an empty setup", async () => {
    getHomeProfile.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderPage()
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/permission-denied/))
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
    expect(screen.queryByTestId("setup-categories")).toBeNull()
  })

  it("her own words become a plain home task on the cadence she picked", async () => {
    addCustomHomeTask.mockResolvedValue({ data: { title: "Have the chimney swept" }, error: null })
    renderPage()
    const input = await screen.findByLabelText("Task name")
    fireEvent.change(input, { target: { value: "Have the chimney swept" } })
    fireEvent.change(screen.getByLabelText("How often"), { target: { value: "annual" } })
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }))
    await waitFor(() => expect(addCustomHomeTask).toHaveBeenCalledWith("h1", "Have the chimney swept", "annual", null))
    expect((await screen.findByRole("status")).textContent).toMatch(/Added/)
  })
})

/** A whole-home task as getTaskTemplates returns it — enough for the page's filter and matcher. */
const homeTask = (title: string) => ({
  task_template_id: `t-${title}`, title, scope_type: "home", is_active: true, deleted_at: null, schedule: null,
})

describe("HomeSetup — her own task's \"Added\" line stays on screen", () => {
  // Every Add reloaded the home with the spinner in place of the page, so
  // CustomTask — and the "Added … to your Tasks." it had just said — was
  // unmounted a render later and came back blank: the line was drawn for a
  // single frame. Her own task now refreshes behind the page.
  it("through the refresh that follows the Add — the page never gives way to the spinner", async () => {
    addCustomHomeTask.mockResolvedValue({ data: { title: "Have the chimney swept" }, error: null })
    renderPage()
    fireEvent.change(await screen.findByLabelText("Task name"), { target: { value: "Have the chimney swept" } })
    let answerRefresh!: (v: unknown) => void
    getTaskTemplates.mockReturnValueOnce(new Promise((r) => { answerRefresh = r }))
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }))

    // The task is added and the home is being read again — behind the page.
    await waitFor(() => expect(getTaskTemplates).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("status")).toHaveTextContent("Added Have the chimney swept to your Tasks.")
    expect(screen.queryByText(/Loading your answers/)).toBeNull()

    await act(async () => { answerRefresh({ data: [homeTask("Have the chimney swept")], error: null }) })
    expect(screen.getByRole("status")).toHaveTextContent("Added Have the chimney swept to your Tasks.")
    expect(screen.getByLabelText("Task name")).toHaveValue("")
    expect(screen.queryByText(/Loading your answers/)).toBeNull()
  })

  it("a library Add still reloads the page, and the added suggestion leaves with it (unchanged)", async () => {
    getHomeProfile.mockResolvedValue({ data: { care_facts: { has_smoke_alarms: true }, dismissed_care: [] }, error: null })
    addLibraryTask.mockResolvedValue({ data: {}, error: null })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Add Test smoke and CO alarms" }))
    getTaskTemplates.mockResolvedValue({ data: [homeTask("Test smoke and CO alarms")], error: null })

    // Back from the reload (its spinner hides every row while it runs), without the added one.
    await waitFor(() => {
      expect(screen.getByText("Replace alarm batteries")).toBeTruthy()
      expect(screen.queryByText("Test smoke and CO alarms")).toBeNull()
    })
    expect(addLibraryTask).toHaveBeenCalledTimes(1)
  })

  it("Try again shows the loading line at once, then the page", async () => {
    getHomeProfile.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: /Try again/ }))

    expect(screen.getByText(/Loading your answers/)).toBeTruthy()
    expect(await screen.findByTestId("setup-categories")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
