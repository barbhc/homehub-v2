/**
 * Your home (/your-home) — the questions write care facts, the facts unlock
 * whole-home care, and every failure is visible where it happened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const getHomeProfile = vi.fn()
const upsertHomeProfile = vi.fn()
const getTaskTemplates = vi.fn()
const addLibraryTask = vi.fn()
const getHomeNotes = vi.fn()
const listHouseRules = vi.fn()
const getRooms = vi.fn()
const dismissLibrarySuggestion = vi.fn()

vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "h1" } }),
  getHomeProfile: (...a: unknown[]) => getHomeProfile(...a),
  upsertHomeProfile: (...a: unknown[]) => upsertHomeProfile(...a),
  getRooms: (...a: unknown[]) => getRooms(...a),
}))
vi.mock("@/modules/care", () => ({
  getTaskTemplates: (...a: unknown[]) => getTaskTemplates(...a),
  addLibraryTask: (...a: unknown[]) => addLibraryTask(...a),
  getHomeNotes: (...a: unknown[]) => getHomeNotes(...a),
  listHouseRules: (...a: unknown[]) => listHouseRules(...a),
  dismissLibrarySuggestion: (...a: unknown[]) => dismissLibrarySuggestion(...a),
}))
vi.mock("@/components/layout", () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
// The two editors this page opens have their own suites.
vi.mock("@/components/settings/HomeProfileSection", () => ({ HomeProfileSection: ({ homeId }: { homeId: string }) => <div data-testid="basics-editor">{homeId}</div> }))
vi.mock("@/components/settings/HouseRulesSection", () => ({ HouseRulesSection: ({ homeId }: { homeId: string }) => <div data-testid="rules-editor">{homeId}</div> }))

const { default: YourHome } = await import("./YourHome")
const { categoryStatus, CATEGORIES } = await import("./homeSetupCategories")

const renderPage = () => render(<MemoryRouter><YourHome /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  getTaskTemplates.mockResolvedValue({ data: [], error: null })
  getHomeProfile.mockResolvedValue({ data: { care_facts: {}, dismissed_care: [] }, error: null })
  upsertHomeProfile.mockResolvedValue({ data: null, error: null })
  getHomeNotes.mockResolvedValue({ data: [], error: null })
  listHouseRules.mockResolvedValue({ data: [], error: null })
  getRooms.mockResolvedValue({ data: [], error: null })
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

describe("Your home — the questions", () => {
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
})

/** A whole-home task as getTaskTemplates returns it — enough for the page's filter and matcher. */
const homeTask = (title: string) => ({
  task_template_id: `t-${title}`, title, scope_type: "home", is_active: true, deleted_at: null, schedule: null,
})

describe("Your home — reloads", () => {
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

describe("Your home — one page for the house", () => {
  const note = (heading: string, body: string, over: Record<string, unknown> = {}) => ({
    note_id: `n-${heading}`, home_id: "h1", scope: "home", room_id: null, item_unit_id: null,
    title: heading, content: body, pinned_at: null, created_at: "2026-01-01", updated_at: "2026-01-01", deleted_at: null, ...over,
  })

  it("shows the basics as rows, with the county and climate in one line", async () => {
    getHomeProfile.mockResolvedValue({ data: {
      care_facts: {}, dismissed_care: [], home_type: "condo", ownership: "own", zip: "94110",
      area: { county: "San Francisco County" }, climate: "mild", freeze_risk: false,
    }, error: null })
    renderPage()
    const rows = await screen.findAllByTestId("basics-row")
    expect(rows.map((r) => r.textContent)).toEqual(["Home typeCondo", "Own or rentOwn", "Zip94110"])
    expect(screen.getByText("San Francisco County. Mild, rarely freezes.")).toBeTruthy()
  })

  it("a basic that was never answered reads Not set, and the row opens the editor", async () => {
    renderPage()
    const rows = await screen.findAllByTestId("basics-row")
    expect(rows[0].textContent).toBe("Home typeNot set")
    fireEvent.click(rows[0])
    expect(await screen.findByTestId("basics-editor")).toHaveTextContent("h1")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The basics")
  })

  it("with no answers there is no Suggested section to explain itself", async () => {
    renderPage()
    await screen.findByTestId("setup-categories")
    expect(screen.queryByTestId("home-suggestions")).toBeNull()
  })

  it("a shutoff that is noted shows where it is; one that isn't offers Add with that idea", async () => {
    getHomeNotes.mockResolvedValue({ data: [note("Water shutoff", "Garage, left of the water heater")], error: null })
    renderPage()
    const rows = await screen.findAllByTestId("home-pinch-row")
    expect(rows[0]).toHaveTextContent("Water shutoffGarage, left of the water heater")
    expect(rows[0]).toHaveAttribute("href", "/inventory/notes")
    expect(rows[1]).toHaveTextContent("Gas shutoffNot noted yetAdd")
    expect(rows[1]).toHaveAttribute("href", "/inventory/notes?idea=Gas%20shutoff")
  })

  it("notes that couldn't be read say so and offer Try again: never Add over a note that may exist", async () => {
    getHomeNotes.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    renderPage()
    const pinch = await screen.findByTestId("home-pinch")
    await waitFor(() => expect(pinch).toHaveTextContent("Couldn't load these."))
    expect(screen.queryByTestId("home-pinch-row")).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0])
    expect(await screen.findAllByTestId("home-pinch-row")).toHaveLength(3)
  })

  it("counts house notes and names the rooms that have notes", async () => {
    getRooms.mockResolvedValue({ data: [{ room_id: "r1", name: "Kitchen" }, { room_id: "r2", name: "Garage" }], error: null })
    getHomeNotes.mockResolvedValue({ data: [
      note("Paint", "Swiss Coffee"), note("Wi-Fi", "On the fridge"),
      note("a", "x", { note_id: "k1", scope: "room", room_id: "r1" }), note("b", "y", { note_id: "k2", scope: "room", room_id: "r1" }),
      note("c", "z", { note_id: "g1", scope: "room", room_id: "r2" }),
    ], error: null })
    renderPage()
    const notes = await screen.findByTestId("home-notes")
    await waitFor(() => expect(notes).toHaveTextContent("House notes2 saved"))
    expect(notes).toHaveTextContent("By roomKitchen 2 · Garage 1")
  })

  it("house rules: none yet says where they come from; some shows the count; a failed read never says none", async () => {
    renderPage()
    expect(await screen.findByTestId("home-rules-row")).toHaveTextContent("None yet. They come from tuning tasks.")
  })

  it("house rules that couldn't be read are an error with a retry", async () => {
    listHouseRules.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    listHouseRules.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }], error: null })
    renderPage()
    const rules = await screen.findByTestId("home-rules")
    await waitFor(() => expect(rules).toHaveTextContent("Couldn't load these."))
    expect(screen.queryByTestId("home-rules-row")).toBeNull()
    fireEvent.click(within(rules).getByRole("button", { name: "Try again" }))
    expect(await screen.findByTestId("home-rules-row")).toHaveTextContent("2 in use")
  })

  it("a link straight to an editor opens it (?part=rules)", async () => {
    render(<MemoryRouter initialEntries={["/your-home?part=rules"]}><YourHome /></MemoryRouter>)
    expect(await screen.findByTestId("rules-editor")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Your home/ }))
    expect(await screen.findByTestId("setup-categories")).toBeTruthy()
  })
})
