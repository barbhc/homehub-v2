/**
 * The empty-Home card (before-friends mock 1, plan B2). Each case is a line of
 * the mock's must-be-true list or a Codex finding the plan folded in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { SWRConfig } from "swr"

type Item = { display_name: string; category: string; brand: null; model: null }
const svc = vi.hoisted(() => ({
  items: [] as Item[],
  titles: [] as string[],
  facts: {} as Record<string, boolean>,
  dismissed: [] as string[],
  loadFails: false,
  /** Hold the reads until a test lets them go. */
  hold: null as null | Promise<void>,
  taskFails: 0,
  saveFails: false,
  takeBackFails: false,
  nextItem: 0,
}))
type Fn = (...a: unknown[]) => Promise<unknown>
const createItemUnit = vi.hoisted(() => vi.fn<Fn>(async () => ({ data: { item_unit_id: `item-${++svc.nextItem}` }, error: null })))
const softDeleteItemUnit = vi.hoisted(() => vi.fn(async () => (svc.takeBackFails ? { success: false, error: "permission-denied" } : { success: true })))
const addLibraryTask = vi.hoisted(() => vi.fn<Fn>(async () => {
  if (svc.taskFails > 0) { svc.taskFails -= 1; return { data: null, error: { message: "Offline." } } }
  return { data: { task_template_id: "t" }, error: null }
}))
const upsertHomeProfile = vi.hoisted(() => vi.fn<Fn>(async () => (svc.saveFails ? { data: null, error: { message: "Offline." } } : { data: {}, error: null })))
const track = vi.hoisted(() => vi.fn())

vi.mock("@/modules/items", () => ({
  getItemUnits: async () => {
    if (svc.hold) await svc.hold
    return svc.loadFails ? { data: null, error: { message: "Offline." } } : { data: svc.items, error: null }
  },
  createItemUnit,
  softDeleteItemUnit,
}))
vi.mock("@/modules/care", () => ({
  getTaskTemplates: async () => ({ data: svc.titles.map((title) => ({ title })), error: null }),
  addLibraryTask,
}))
vi.mock("@/modules/home", () => ({
  getHomeProfile: async () => ({ data: { care_facts: svc.facts, dismissed_care: svc.dismissed, area: { hazards: [] }, freeze_risk: true }, error: null }),
  upsertHomeProfile,
  getRooms: async () => ({ data: [{ room_id: "room-kitchen", name: "Kitchen" }, { room_id: "room-utility", name: "Utility Room" }], error: null }),
}))
vi.mock("@/lib/analytics", () => ({ track }))

const { WhatsInYourHomeCard } = await import("./WhatsInYourHomeCard")

const onEngaged = vi.fn()
const onFinished = vi.fn()

function Landed() {
  const loc = useLocation()
  return <p data-testid="landed">{loc.pathname + loc.search}</p>
}
function tree(fallback: Record<string, unknown> = {}) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, fallback }}>
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route path="/home" element={<WhatsInYourHomeCard homeId="home-1" onEngaged={onEngaged} onFinished={onFinished} />} />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    </SWRConfig>
  )
}
const renderCard = (fallback?: Record<string, unknown>) => render(tree(fallback))
const button = (name: string | RegExp) => screen.getByRole("button", { name })
const tap = (name: string | RegExp) => fireEvent.click(button(name))
/** The card has loaded (its buttons enable once its own read says the home is empty). */
const loaded = async () => {
  await screen.findByText("What's in your home?")
  await waitFor(() => expect(button("Not now")).toBeEnabled())
}
const filledButtons = (root: HTMLElement) =>
  within(root).getAllByRole("button").filter((b) => b.getAttribute("style")?.includes("--hh-teal-fill") && !b.hasAttribute("aria-pressed"))

beforeEach(() => {
  Object.assign(svc, { items: [], titles: [], facts: {}, dismissed: [], loadFails: false, hold: null, taskFails: 0, saveFails: false, takeBackFails: false, nextItem: 0 })
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe("Pick", () => {
  it("the mock's words and chips; carbon monoxide (CO) is spelled out wherever CO appears", async () => {
    renderCard()
    await loaded()
    const card = screen.getByTestId("empty-home-card")
    expect(card).toHaveTextContent("Tap what you have. Homehub suggests the care that goes with it, and adds nothing until you say so.")
    for (const g of ["Safety", "Heating and water", "Appliances"]) expect(within(card).getByText(g)).toBeInTheDocument()
    expect(button("Smoke alarms")).toHaveAttribute("aria-pressed", "false")
    expect(button("Carbon monoxide (CO) alarms")).toBeInTheDocument()
    // Must-be-true 2: "CO" never without "carbon monoxide" beside it — scan the card's text.
    const text = card.textContent ?? ""
    const bare = [...text.matchAll(/\bCO\b/g)].filter((m) => !/carbon monoxide \($/i.test(text.slice(Math.max(0, m.index! - 17), m.index)))
    expect(bare).toEqual([])
    // Range hood and the small appliances wait behind More….
    expect(screen.queryByRole("button", { name: "Range hood" })).toBeNull()
    tap("More…")
    expect(button("Range hood")).toBeInTheDocument()
    expect(button("Food recycler")).toBeInTheDocument()
    // Snap a label instead is not on this card.
    expect(screen.queryByText(/Snap a label/)).toBeNull()
    expect(card).toHaveAttribute("data-tour-halt", "")
  })

  it("See Suggested Care is disabled with nothing ticked and enabled after one tick", async () => {
    renderCard()
    await loaded()
    expect(button("See Suggested Care")).toBeDisabled()
    tap("Dishwasher")
    expect(button("Dishwasher")).toHaveAttribute("aria-pressed", "true")
    expect(button("See Suggested Care")).toBeEnabled()
    tap("Dishwasher")
    expect(button("See Suggested Care")).toBeDisabled()
  })

  it("until its own read answers, the chips show and every button is disabled", async () => {
    let release!: () => void
    svc.hold = new Promise<void>((r) => { release = r })
    renderCard()
    expect(screen.getByText("What's in your home?")).toBeInTheDocument()
    for (const name of ["See Suggested Care", "Add My Exact Models", "Not now", "Smoke alarms"]) expect(button(name)).toBeDisabled()
    await act(async () => { release() })
    await waitFor(() => expect(button("Not now")).toBeEnabled())
  })

  it("a failed load says so with a retry; the chips still render", async () => {
    svc.loadFails = true
    renderCard()
    expect(await screen.findByText("Couldn't load your home.")).toBeInTheDocument()
    expect(button("Smoke alarms")).toBeInTheDocument()
    expect(button("See Suggested Care")).toBeDisabled()
    svc.loadFails = false
    tap("Try again")
    await waitFor(() => expect(button("Not now")).toBeEnabled())
  })

  it("one filled button: See Suggested Care. Add My Exact Models is outlined; Not now is text", async () => {
    renderCard()
    await loaded()
    tap("Dishwasher")
    expect(filledButtons(screen.getByTestId("empty-home-card")).map((b) => b.textContent)).toEqual(["See Suggested Care"])
    expect(button("Add My Exact Models").getAttribute("style")).toContain("border-color: var(--hh-teal)")
    expect(screen.getByText("Brand and model, or the manual, gets you the maker's schedule.")).toBeInTheDocument()
  })
})

describe("See Suggested Care", () => {
  it("two fact chips: ONE profile write holding only those two facts as true", async () => {
    renderCard()
    await loaded()
    tap("Smoke alarms")
    tap("Carbon monoxide (CO) alarms")
    tap("Dishwasher")
    tap("See Suggested Care")
    await screen.findByText("Suggested for your home")
    expect(upsertHomeProfile).toHaveBeenCalledTimes(1)
    expect(upsertHomeProfile).toHaveBeenCalledWith("home-1", { care_facts: { has_smoke_alarms: true, has_co_alarms: true } })
    expect(onEngaged).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Your answers are saved with your home. Change them anytime in Your Home.")).toBeInTheDocument()
  })

  it("only appliance chips: no profile write, and no saved-answers line", async () => {
    renderCard()
    await loaded()
    tap("Dishwasher")
    tap("See Suggested Care")
    await screen.findByText("Suggested for your home")
    expect(upsertHomeProfile).not.toHaveBeenCalled()
    expect(screen.queryByText(/Your answers are saved/)).toBeNull()
  })

  it("nothing is created before an Add tap", async () => {
    renderCard()
    await loaded()
    for (const c of ["Smoke alarms", "Carbon monoxide (CO) alarms", "Water heater", "Dishwasher"]) tap(c)
    tap("See Suggested Care")
    await screen.findByText("Suggested for your home")
    expect(addLibraryTask).not.toHaveBeenCalled()
    expect(createItemUnit).not.toHaveBeenCalled()
  })

  it("a failed profile write keeps her on Pick with an error", async () => {
    svc.saveFails = true
    renderCard()
    await loaded()
    tap("Smoke alarms")
    tap("See Suggested Care")
    expect(await screen.findByText("Couldn't save that. Offline.")).toBeInTheDocument()
    expect(screen.getByText("What's in your home?")).toBeInTheDocument()
    expect(screen.queryByText("Suggested for your home")).toBeNull()
    expect(onEngaged).not.toHaveBeenCalled()
  })

  it("the mock's four rows, essentials marked, the carbon monoxide (CO) row with its why", async () => {
    renderCard()
    await loaded()
    for (const c of ["Smoke alarms", "Carbon monoxide (CO) alarms", "Water heater", "Dishwasher"]) tap(c)
    tap("See Suggested Care")
    const care = await screen.findByTestId("empty-home-care")
    const rows = within(care).getAllByTestId("empty-home-row")
    expect(rows.map((r) => r.querySelector("p")?.textContent)).toEqual([
      "Test the smoke alarms", "Check the carbon monoxide (CO) alarm's date", "Flush the water heater", "Clean the dishwasher filter",
    ])
    expect(rows[0]).toHaveTextContent("Essential · Twice a year · 5 min")
    expect(rows[1]).toHaveTextContent("Essential · Yearly · 2 min")
    expect(rows[1]).toHaveTextContent("Most last 5 to 10 years")
    expect(rows[2]).toHaveTextContent("Yearly · 45 min")
    expect(rows[2]).not.toHaveTextContent("Essential")
    expect(rows[2]).not.toHaveTextContent("Sediment") // the why shows only on the carbon monoxide (CO) row
    // Must-be-true 2, on this stage too.
    const text = care.textContent ?? ""
    expect([...text.matchAll(/\bCO\b/g)].every((m) => /carbon monoxide \($/i.test(text.slice(Math.max(0, m.index! - 17), m.index)))).toBe(true)
    expect(filledButtons(care).map((b) => b.textContent)).toEqual(["Done"])
  })
})

describe("Add", () => {
  async function toCare(...chips: string[]) {
    renderCard()
    await loaded()
    for (const c of chips) tap(c)
    tap("See Suggested Care")
    await screen.findByTestId("empty-home-care")
  }

  it("a fact row makes a home-level task, starting this weekend; the row reads Added", async () => {
    await toCare("Smoke alarms")
    tap("Add Test the smoke alarms")
    expect(await screen.findByText("Added")).toBeInTheDocument()
    expect(addLibraryTask).toHaveBeenCalledWith("home-1", null, expect.objectContaining({ key: "home.alarm_test" }), { firstDue: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(createItemUnit).not.toHaveBeenCalled()
    expect(track).toHaveBeenCalledWith("home_question_task_added", { key: "home.alarm_test" })
  })

  it("an appliance row makes the item once, then the task; a second row of it reuses the item", async () => {
    await toCare("Dryer")
    tap("Add Clean the lint filter")
    await waitFor(() => expect(addLibraryTask).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(button("Add Clean the dryer vent duct")).toBeEnabled())
    tap("Add Clean the dryer vent duct")
    await waitFor(() => expect(screen.getAllByText("Added")).toHaveLength(2))
    expect(createItemUnit).toHaveBeenCalledTimes(1)
    expect(createItemUnit).toHaveBeenCalledWith(expect.objectContaining({ home_id: "home-1", display_name: "Dryer", category: "dryer", item_category: "major_appliance" }))
    expect(addLibraryTask.mock.calls.map((c) => c[1])).toEqual(["item-1", "item-1"])
    expect(track).toHaveBeenCalledWith("home_kind_added", { kind: "dryer", tasks: 1 })
  })

  it("essentials: the first added in this visit starts on the first day, every later one on the second", async () => {
    await toCare("Smoke alarms", "Carbon monoxide (CO) alarms")
    tap("Add Test the smoke alarms")
    await waitFor(() => expect(button("Add Check the carbon monoxide (CO) alarm's date")).toBeEnabled())
    tap("Add Check the carbon monoxide (CO) alarm's date")
    await waitFor(() => expect(addLibraryTask).toHaveBeenCalledTimes(2))
    const [first, second] = addLibraryTask.mock.calls.map((c) => (c[3] as { firstDue: string }).firstDue)
    expect(second > first).toBe(true)
  })

  it("a water heater records that the home has one, only after its task is in", async () => {
    await toCare("Water heater")
    tap("Add Flush the water heater")
    await screen.findByText("Added")
    expect(upsertHomeProfile).toHaveBeenCalledWith("home-1", { care_facts: { has_water_heater: true } })
    expect(addLibraryTask.mock.invocationCallOrder[0]).toBeLessThan(upsertHomeProfile.mock.invocationCallOrder[0])
  })

  it("a failed task write shows an error and never Added (failure path)", async () => {
    svc.taskFails = 1
    await toCare("Smoke alarms")
    tap("Add Test the smoke alarms")
    expect(await screen.findByText("Couldn't add that. Offline.")).toBeInTheDocument()
    expect(screen.queryByText("Added")).toBeNull()
    expect(button("Add Test the smoke alarms")).toBeEnabled()
  })

  it("no item is left with zero tasks: a made item whose task fails is taken back, and the retry makes exactly one", async () => {
    svc.taskFails = 1
    await toCare("Dishwasher")
    tap("Add Clean the dishwasher filter")
    expect(await screen.findByText("Couldn't add that. Try again.")).toBeInTheDocument()
    expect(createItemUnit).toHaveBeenCalledTimes(1)
    expect(softDeleteItemUnit).toHaveBeenCalledWith("home-1", "item-1")
    expect(screen.queryByText("Added")).toBeNull()
    tap("Add Clean the dishwasher filter")
    expect(await screen.findByText("Added")).toBeInTheDocument()
    expect(createItemUnit).toHaveBeenCalledTimes(2)
    expect(addLibraryTask.mock.calls.map((c) => c[1])).toEqual(["item-1", "item-2"])
    // The taken-back item is never the one Add My Exact Models opens.
    tap("Edit what you have")
    tap("Add My Exact Models")
    expect(screen.getByTestId("landed")).toHaveTextContent("/items/item-2")
  })

  it("a take-back that fails too keeps the item, logs both with ids, says so, and the retry reuses it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    svc.taskFails = 1
    svc.takeBackFails = true
    await toCare("Dishwasher")
    tap("Add Clean the dishwasher filter")
    expect(await screen.findByText("Your dishwasher is added, but this task couldn't be. Try again.")).toBeInTheDocument()
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/home home-1: item item-1 \(dishwasher\).*Offline\..*permission-denied/))
    tap("Add Clean the dishwasher filter")
    expect(await screen.findByText("Added")).toBeInTheDocument()
    expect(createItemUnit).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it("a write that throws (not just errors) says so, and takes back the item it made", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    addLibraryTask.mockImplementationOnce(async () => { throw new Error("Network down.") })
    await toCare("Dishwasher")
    tap("Add Clean the dishwasher filter")
    expect(await screen.findByText("Couldn't add that. Network down.")).toBeInTheDocument()
    expect(softDeleteItemUnit).toHaveBeenCalledWith("home-1", "item-1")
    expect(screen.queryByText("Added")).toBeNull()
    expect(button("Add Clean the dishwasher filter")).toBeEnabled()
    err.mockRestore()
  })

  it("while one Add is in flight every other Add is disabled", async () => {
    let finish!: () => void
    addLibraryTask.mockImplementationOnce(() => new Promise((r) => { finish = () => r({ data: { task_template_id: "t" }, error: null }) }))
    await toCare("Smoke alarms", "Carbon monoxide (CO) alarms", "Fire extinguisher")
    tap("Add Test the smoke alarms")
    await waitFor(() => expect(addLibraryTask).toHaveBeenCalledTimes(1))
    expect(button("Add Check the carbon monoxide (CO) alarm's date")).toBeDisabled()
    expect(button("Add Check the fire extinguisher")).toBeDisabled()
    fireEvent.click(button("Add Check the fire extinguisher"))
    await act(async () => { finish() })
    await waitFor(() => expect(button("Add Check the fire extinguisher")).toBeEnabled())
    expect(addLibraryTask).toHaveBeenCalledTimes(1)
  })

  it("Edit what you have returns to Pick with the ticks intact; added rows stay added", async () => {
    await toCare("Smoke alarms", "Dishwasher")
    tap("Add Test the smoke alarms")
    await screen.findByText("Added")
    tap("Edit what you have")
    expect(button("Smoke alarms")).toHaveAttribute("aria-pressed", "true")
    expect(button("Dishwasher")).toHaveAttribute("aria-pressed", "true")
    tap("See Suggested Care")
    const care = await screen.findByTestId("empty-home-care")
    expect(within(care).getByText("Added")).toBeInTheDocument()
    expect(within(care).getByText("Test the smoke alarms")).toBeInTheDocument()
  })
})

describe("Done", () => {
  it("after an add: remembers the old card is answered on this phone and hands Home back", async () => {
    renderCard()
    await loaded()
    tap("Smoke alarms")
    tap("See Suggested Care")
    await screen.findByTestId("empty-home-care")
    tap("Add Test the smoke alarms")
    await screen.findByText("Added")
    tap("Done")
    expect(window.localStorage.getItem("hh.dayOne.appliancesDismissed.home-1")).toBe("1")
    expect(window.localStorage.getItem("hh.emptyHome.collapsed.home-1")).toBeNull()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it("with nothing added: the collapsed row (D9), still collapsed after a remount", async () => {
    const { unmount } = renderCard()
    await loaded()
    tap("Smoke alarms")
    tap("Carbon monoxide (CO) alarms")
    tap("See Suggested Care")
    await screen.findByTestId("empty-home-care")
    tap("Done")
    expect(screen.getByTestId("empty-home-collapsed")).toBeInTheDocument()
    expect(screen.queryByTestId("empty-home-care")).toBeNull()
    expect(onFinished).toHaveBeenCalledTimes(1)
    unmount()
    renderCard()
    expect(await screen.findByTestId("empty-home-collapsed")).toBeInTheDocument()
    expect(screen.queryByTestId("empty-home-card")).toBeNull()
  })

  it("everything already covered: nothing new to suggest, and Done", async () => {
    svc.dismissed = ["food_recycler.carbon"]
    renderCard()
    await loaded()
    tap("More…")
    tap("Food recycler")
    tap("See Suggested Care")
    const care = await screen.findByTestId("empty-home-care")
    expect(care).toHaveTextContent("Nothing new to suggest for these.")
    expect(screen.queryAllByTestId("empty-home-row")).toHaveLength(0)
    expect(button("Done")).toBeEnabled()
  })
})

describe("Not now and the collapsed row", () => {
  it("Not now after See Suggested Care lets go of Home's pin", async () => {
    renderCard()
    await loaded()
    tap("Smoke alarms")
    tap("See Suggested Care")
    await screen.findByTestId("empty-home-care")
    tap("Add Test the smoke alarms")
    await screen.findByText("Added")
    tap("Edit what you have")
    tap("Not now")
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it("Not now before engaging does not touch Home", async () => {
    renderCard()
    await loaded()
    tap("Not now")
    expect(onFinished).not.toHaveBeenCalled()
  })

  it("Not now: the collapsed row in the card's place (the full card is not rendered); tapping it brings the card back; the flag survives a remount", async () => {
    const { unmount } = renderCard()
    await loaded()
    tap("Not now")
    const row = screen.getByTestId("empty-home-collapsed")
    expect(row).toHaveTextContent("Tell us what's in your home")
    expect(row).toHaveTextContent("You can add a model or manual anytime in Items.")
    expect(row).toHaveAttribute("data-tour-halt", "")
    // "The full card is hidden": not in the DOM at all.
    expect(screen.queryByTestId("empty-home-card")).toBeNull()
    expect(window.localStorage.getItem("hh.emptyHome.collapsed.home-1")).toBe("1")
    unmount()
    renderCard()
    const again = await screen.findByTestId("empty-home-collapsed")
    fireEvent.click(within(again).getByRole("button", { name: /Tell us what's in your home/ }))
    expect(await screen.findByText("What's in your home?")).toBeInTheDocument()
    expect(window.localStorage.getItem("hh.emptyHome.collapsed.home-1")).toBeNull()
  })
})

describe("Add My Exact Models", () => {
  const target = () => screen.getByTestId("landed").textContent

  it("no ticks: the appliance lane", async () => {
    renderCard()
    await loaded()
    tap("Add My Exact Models")
    expect(target()).toBe("/inventory/add?lane=appliance")
  })

  it("Dishwasher only: the dishwasher pre-picked", async () => {
    renderCard()
    await loaded()
    tap("Dishwasher")
    tap("Smoke alarms") // a fact chip does not count as an appliance
    tap("Add My Exact Models")
    expect(target()).toBe("/inventory/add?lane=appliance&kind=dishwasher")
  })

  it("two appliances: no kind", async () => {
    renderCard()
    await loaded()
    tap("Dishwasher")
    tap("Washer")
    tap("Add My Exact Models")
    expect(target()).toBe("/inventory/add?lane=appliance")
  })

  it("after making one item: that item's page", async () => {
    renderCard()
    await loaded()
    tap("Dishwasher")
    tap("See Suggested Care")
    await screen.findByTestId("empty-home-care")
    tap("Add Clean the dishwasher filter")
    await screen.findByText("Added")
    tap("Edit what you have")
    tap("Add My Exact Models")
    expect(target()).toBe("/items/item-1")
  })
})

describe("the card's own read decides whether the home is empty (Codex)", () => {
  const empty = { homeId: "home-1", items: [], taskCount: 0, facts: {}, ctx: { existingTitles: [], dismissed: [], area: [] } }
  const populated = { ...empty, items: [{ display_name: "Dishwasher", category: "dishwasher", brand: null, model: null }], taskCount: 1, ctx: { existingTitles: ["Clean the dishwasher filter"] } }

  it("retained data says empty, the fresh read says populated: the card goes, and nothing pins", async () => {
    svc.items = [{ display_name: "Dishwasher", category: "dishwasher", brand: null, model: null }]
    svc.titles = ["Clean the dishwasher filter"]
    const { container } = renderCard({ "day-one:home-1": empty })
    await waitFor(() => expect(container.querySelector("[data-testid]")).toBeNull())
    expect(onEngaged).not.toHaveBeenCalled()
  })

  it("retained data says populated, the fresh read says empty: the card appears", async () => {
    const { container } = renderCard({ "day-one:home-1": populated })
    expect(container.querySelector("[data-testid='empty-home-card']")).toBeNull()
    expect(await screen.findByTestId("empty-home-card")).toBeInTheDocument()
    await waitFor(() => expect(button("Not now")).toBeEnabled())
  })

  it("a home with tasks but no items is not this card's", async () => {
    svc.titles = ["Test smoke and CO alarms"]
    const { container } = renderCard()
    // The chips show disabled until the read answers; then the card renders nothing.
    await waitFor(() => expect(container.querySelector("[data-testid]")).toBeNull())
    expect(onEngaged).not.toHaveBeenCalled()
  })

  it("once engaged, her own first Add making the home non-empty does not take the card away", async () => {
    renderCard()
    await loaded()
    tap("Dishwasher")
    tap("See Suggested Care")
    await screen.findByTestId("empty-home-care")
    svc.items = [{ display_name: "Dishwasher", category: "dishwasher", brand: null, model: null }]
    svc.titles = ["Clean the dishwasher filter"]
    tap("Add Clean the dishwasher filter")
    await screen.findByText("Added")
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByTestId("empty-home-care")).toBeInTheDocument()
  })
})
