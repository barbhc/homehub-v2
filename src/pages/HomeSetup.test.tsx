/**
 * Your home (/home-setup) — the questions write care facts, the facts unlock
 * whole-home care, and every failure is visible where it happened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
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

const { default: HomeSetup, categoryStatus, CATEGORIES } = await import("./HomeSetup")

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
