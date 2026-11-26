/**
 * Home's next-step card (design/day-one-home.md): appliances first, then one
 * question, then the label. A tap writes nothing; Add writes the item and the
 * checked tasks; every failure is said where it happened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { SWRConfig } from "swr"

const svc = vi.hoisted(() => ({
  items: [] as { display_name: string; category: string; brand: null; model: null }[],
  titles: [] as string[],
  facts: {} as Record<string, boolean>,
  loadFails: false,
  taskFailsOnce: false,
  saveFails: false,
}))
const createItemUnit = vi.hoisted(() => vi.fn(async () => ({ data: { item_unit_id: "item-new" }, error: null })))
const addLibraryTask = vi.hoisted(() => vi.fn(async () => {
  if (svc.taskFailsOnce) { svc.taskFailsOnce = false; return { data: null, error: { message: "Offline." } } }
  return { data: { task_template_id: "t" }, error: null }
}))
const upsertHomeProfile = vi.hoisted(() => vi.fn(async () => (svc.saveFails ? { data: null, error: { message: "Offline." } } : { data: {}, error: null })))
const dismissLibrarySuggestion = vi.hoisted(() => vi.fn(async () => ({ data: true, error: null })))

vi.mock("@/modules/items", () => ({
  getItemUnits: async () => (svc.loadFails ? { data: null, error: { message: "Offline." } } : { data: svc.items, error: null }),
  createItemUnit,
}))
vi.mock("@/modules/care", () => ({
  getTaskTemplates: async () => ({ data: svc.titles.map((title) => ({ title })), error: null }),
  addLibraryTask,
  dismissLibrarySuggestion,
}))
vi.mock("@/modules/home", () => ({
  getHomeProfile: async () => ({ data: { care_facts: svc.facts, dismissed_care: [], area: { hazards: [] }, freeze_risk: true }, error: null }),
  upsertHomeProfile,
  getRooms: async () => ({ data: [{ room_id: "room-utility", name: "Utility Room" }, { room_id: "room-kitchen", name: "Kitchen" }], error: null }),
}))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const { NextStepCard } = await import("./NextStepCard")

const onChanged = vi.fn()
const renderCard = (totalItems = 0) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter><NextStepCard homeId="home-1" totalItems={totalItems} onChanged={onChanged} /></MemoryRouter>
    </SWRConfig>,
  )
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }))
/** Where a navigation landed: the card on /home, anything else prints its address. */
function Landed() {
  const loc = useLocation()
  return <p data-testid="landed">{loc.pathname + loc.search}</p>
}
const renderRouted = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route path="/home" element={<NextStepCard homeId="home-1" totalItems={0} onChanged={onChanged} />} />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    </SWRConfig>,
  )

beforeEach(() => {
  Object.assign(svc, { items: [], titles: ["Test smoke and CO alarms"], facts: {}, loadFails: false, taskFailsOnce: false, saveFails: false })
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe("What's in your home?", () => {
  it("a tap shows the care and writes nothing; essentials come pre-checked", async () => {
    renderCard()
    await screen.findByText("What's in your home?")
    tap("Furnace")
    const panel = screen.getByTestId("appliance-panel")
    expect(within(panel).getByRole("checkbox", { name: /Replace the air filter/ })).toBeChecked()
    expect(within(panel).getByRole("checkbox", { name: /Furnace or HVAC service/ })).not.toBeChecked()
    expect(within(panel).getByText(/Call a pro/)).toBeInTheDocument()
    expect(createItemUnit).not.toHaveBeenCalled()
    expect(addLibraryTask).not.toHaveBeenCalled()
  })

  it("Add makes the item in its usual room and the checked task, starting this week", async () => {
    renderCard()
    await screen.findByText("What's in your home?")
    tap("Furnace")
    tap("Add furnace and 1 task")
    expect(await screen.findByText("Added your furnace with 1 task.")).toBeInTheDocument()
    expect(createItemUnit).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Furnace", category: "furnace", room_id: "room-utility" }))
    expect(addLibraryTask).toHaveBeenCalledTimes(1)
    expect(addLibraryTask).toHaveBeenCalledWith("home-1", "item-new", expect.objectContaining({ key: "furnace.filter" }), { firstDue: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(onChanged).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Furnace" })).toBeDisabled()
  })

  it("a task that fails says so, and the retry adds only the task — never a second furnace", async () => {
    svc.taskFailsOnce = true
    renderCard()
    await screen.findByText("What's in your home?")
    tap("Furnace")
    tap("Add furnace and 1 task")
    expect(await screen.findByText(/Your furnace is added, but a task couldn't be/)).toBeInTheDocument()
    tap("Add 1 task")
    expect(await screen.findByText("Added your furnace with 1 task.")).toBeInTheDocument()
    expect(createItemUnit).toHaveBeenCalledTimes(1)
    expect(addLibraryTask).toHaveBeenCalledTimes(2)
  })

  it("a water heater records that the home has one", async () => {
    renderCard()
    await screen.findByText("What's in your home?")
    tap("Water heater")
    tap("Add water heater")
    await screen.findByText("Added your water heater.")
    expect(upsertHomeProfile).toHaveBeenCalledWith("home-1", { care_facts: { has_water_heater: true } })
  })

  it("Not now hides it on this device and moves on to a question", async () => {
    renderCard()
    await screen.findByText("What's in your home?")
    tap("Not now")
    expect(await screen.findByText("Do you have a furnace or central air?")).toBeInTheDocument()
    expect(window.localStorage.getItem("hh.dayOne.appliancesDismissed.home-1")).toBe("1")
  })

  it("a warm-cache zero does not bring it back once the home has an item", async () => {
    svc.items = [{ display_name: "Journey Kettle", category: "kettle", brand: null, model: null }]
    renderCard(0) // Home's snapshot still says none; this card's own read has one
    expect(await screen.findByText("Do you have a furnace or central air?")).toBeInTheDocument()
    expect(screen.queryByText("What's in your home?")).toBeNull()
  })

  it("a failed load says so and offers Try again — never chips with unknown duplicates", async () => {
    svc.loadFails = true
    renderCard()
    expect(await screen.findByText("Couldn't load suggestions for your home.")).toBeInTheDocument()
    expect(screen.queryByText("What's in your home?")).toBeNull()
  })
})

describe("its footer: Add My Exact Models (before-friends B4, D5)", () => {
  it("replaces Snap a label instead", async () => {
    renderCard()
    await screen.findByText("What's in your home?")
    expect(screen.getByRole("button", { name: "Add My Exact Models" })).toBeInTheDocument()
    expect(screen.getByText("Brand and model, or the manual, gets you the maker's schedule.")).toBeInTheDocument()
    expect(screen.queryByText(/Snap a label instead/)).toBeNull()
    // The first line stays.
    expect(screen.getByText("Tap what you have to get its typical care. Snap its label later for the exact schedule.")).toBeInTheDocument()
  })

  it("nothing selected: the appliance lane", async () => {
    renderRouted()
    await screen.findByText("What's in your home?")
    tap("Add My Exact Models")
    expect(screen.getByTestId("landed")).toHaveTextContent("/inventory/add?lane=appliance")
    expect(screen.getByTestId("landed").textContent).not.toContain("kind=")
  })

  it("a selected chip that the add screen knows: its kind pre-picked", async () => {
    renderRouted()
    await screen.findByText("What's in your home?")
    tap("Dishwasher")
    tap("Add My Exact Models")
    expect(screen.getByTestId("landed")).toHaveTextContent("/inventory/add?lane=appliance&kind=dishwasher")
  })

  it("after a half-failed add (item made, task refused): still that item", async () => {
    svc.taskFailsOnce = true
    renderRouted()
    await screen.findByText("What's in your home?")
    tap("Furnace")
    tap("Add furnace and 1 task")
    await screen.findByText(/Your furnace is added, but a task couldn't be/)
    tap("Add My Exact Models")
    expect(screen.getByTestId("landed")).toHaveTextContent("/items/item-new")
  })

  it("after an add: the item she just made, never a second one (Codex)", async () => {
    renderRouted()
    await screen.findByText("What's in your home?")
    tap("Furnace")
    tap("Add furnace and 1 task")
    await screen.findByText("Added your furnace with 1 task.")
    tap("Add My Exact Models")
    expect(screen.getByTestId("landed")).toHaveTextContent("/items/item-new")
    expect(createItemUnit).toHaveBeenCalledTimes(1)
  })
})

describe("one question", () => {
  it("Yes saves the answer, then offers the task; nothing is added until Add", async () => {
    renderCard(1)
    await screen.findByText("Do you have a furnace or central air?")
    expect(screen.getByText("Yes adds a filter change every 1–3 months. You choose before anything is added.")).toBeInTheDocument()
    tap("Yes")
    await screen.findByRole("button", { name: "Add 1 task" })
    expect(upsertHomeProfile).toHaveBeenCalledWith("home-1", { care_facts: { has_air_filter: true } })
    expect(addLibraryTask).not.toHaveBeenCalled()
    tap("Add 1 task")
    // Essential since seventeen fixes, so it starts this week like the other essentials.
    await waitFor(() => expect(addLibraryTask).toHaveBeenCalledWith("home-1", null, expect.objectContaining({ key: "home.air_filter", priorityTier: "essential" }), { firstDue: expect.any(String) }))
  })

  it("No saves the answer and adds nothing", async () => {
    renderCard(1)
    await screen.findByText("Do you have a furnace or central air?")
    tap("No")
    await waitFor(() => expect(upsertHomeProfile).toHaveBeenCalledWith("home-1", { care_facts: { has_air_filter: false } }))
    expect(addLibraryTask).not.toHaveBeenCalled()
  })

  it("a save that fails keeps the question and says so", async () => {
    svc.saveFails = true
    renderCard(1)
    await screen.findByText("Do you have a furnace or central air?")
    tap("Yes")
    expect(await screen.findByText("Couldn't save that. Offline.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument()
  })

  it("Not sure moves to the next question on this device, and saves nothing", async () => {
    renderCard(1)
    await screen.findByText("Do you have a furnace or central air?")
    tap("Not sure")
    expect(await screen.findByText("Is there a water heater that's yours to look after?")).toBeInTheDocument()
    expect(upsertHomeProfile).not.toHaveBeenCalled()
  })
})

describe("when nothing is left", () => {
  it("no items: the label card; some items: nothing", async () => {
    svc.facts = { has_air_filter: false, has_water_heater: false, has_smoke_alarms: false, has_co_alarms: false, has_extinguisher: false, has_gutters: false }
    window.localStorage.setItem("hh.dayOne.appliancesDismissed.home-1", "1")
    const { unmount } = renderCard(0)
    expect(await screen.findByTestId("snap-label-card")).toBeInTheDocument()
    unmount()
    const { container } = renderCard(1)
    // Let the reads land first, so "nothing" is the answer and not the loading state.
    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector("[data-testid]")).toBeNull()
  })
})
